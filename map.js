mapboxgl.accessToken = 'pk.eyJ1Ijoic29oYW4yMCIsImEiOiJjbTdkdjhueDAwMjBtMm1xNDBsYjhzMXhiIn0.lJxdBlNbSCNGuQpuh8wuLQ';
const map = new mapboxgl.Map({
  container: 'map', 
  style: 'mapbox://styles/mapbox/streets-v12', 
  center: [-71.0589, 42.3601], 
  zoom: 12, 
  minZoom: 5, 
  maxZoom: 18 
});

function getCoords(station) {
    const point = new mapboxgl.LngLat(+station.lon, +station.lat);
    const { x, y } = map.project(point);
    return { cx: x, cy: y };
}

const bikeLaneStyle = {
    'line-color': '#32D400',  
    'line-width': 5,          
    'line-opacity': 0.6       
};

function formatTime(minutes) {
    const date = new Date(0, 0, 0, 0, minutes);  // Set hours & minutes
    return date.toLocaleString('en-US', { timeStyle: 'short' }); // Format as HH:MM AM/PM
}

map.on('load', async () => {
  map.addSource('boston_bike_routes', {
    type: 'geojson',
    data: 'https://opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson'
  });

  map.addLayer({
    id: 'bike-lanes-boston',
    type: 'line',
    source: 'boston_bike_routes',
    paint: bikeLaneStyle
  });


  map.addSource('cambridge_bike_routes', {
    type: 'geojson',
    data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
  });

  map.addLayer({
    id: 'bike-lanes-cambridge',
    type: 'line',
    source: 'cambridge_bike_routes',
    paint: bikeLaneStyle
  });

  try {
    const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
    const jsonData = await d3.json(jsonurl);
    let stations = jsonData.data.stations;

    const csvUrl = 'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv';
    const trips = await d3.csv(csvUrl, (trip) => {
        trip.started_at = new Date(trip.started_at);
        trip.ended_at = new Date(trip.ended_at);
        return trip;
    });

    stations = computeStationTraffic(stations, trips);
    const radiusScale = d3
        .scaleSqrt()
        .domain([1, d3.max(stations, d => d.totalTraffic || 1)]) 
        .range([3, 30]);
    
    let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]); 
    const svg = d3.select('#map').select('svg');

    const circles = svg.selectAll('circle')
        .data(stations, d => d.short_name)
        .enter()
        .append('circle')
        .attr('r', d => radiusScale(d.totalTraffic))
        .attr('fill', 'steelblue')
        .attr('fill-opacity', 0.6)
        .attr('stroke', 'white')
        .attr('stroke-width', 1)
        .attr('class', 'station-marker')
        .each(function(d) {
            d3.select(this)
                .append('title')
                .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
            })
            .style("--departure-ratio", d => stationFlow(d.departures / d.totalTraffic));
    function updatePositions() {
      circles
        .attr('cx', d => getCoords(d).cx) 
        .attr('cy', d => getCoords(d).cy); 
    }

    updatePositions();
    map.on('move', updatePositions);
    map.on('zoom', updatePositions);
    map.on('resize', updatePositions);
    map.on('moveend', updatePositions);

    const timeSlider = document.getElementById('time-slider');
    const selectedTime = document.getElementById('time-display');
    const anyTimeLabel = document.getElementById('any-time-label');

    function updateScatterPlot(timeFilter) {
        const filteredTrips = filterTripsbyTime(trips, timeFilter);
        const filteredStations = computeStationTraffic(stations, filteredTrips);
        
        timeFilter === -1
          ? radiusScale.range([0, 25])
          : radiusScale.range([3, 50]);
        
        circles
            .data(filteredStations, d => d.short_name)
            .join('circle')
            .attr('r', d => radiusScale(d.totalTraffic))
            .style('--departure-ratio', (d) =>
                stationFlow(d.departures / d.totalTraffic),
              );
    }

    function updateTimeDisplay() {
        let timeFilter = Number(timeSlider.value);

        if (timeFilter === -1) {
            selectedTime.style.display = 'none';
            anyTimeLabel.style.display = 'block';
        } else {
            selectedTime.style.display = 'block';
            selectedTime.textContent = formatTime(timeFilter);
            anyTimeLabel.style.display = 'none';
        }
        
        updateScatterPlot(timeFilter);
    }

    timeSlider.addEventListener('input', updateTimeDisplay);
    updateTimeDisplay();
    } catch (error) {
    console.error('Error loading data:', error);
    }
});


function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
}

function filterTripsbyTime(trips, timeFilter) {
  return timeFilter === -1 
    ? trips // If no filter is applied (-1), return all trips
    : trips.filter((trip) => {
        // Convert trip start and end times to minutes since midnight
        const startedMinutes = minutesSinceMidnight(trip.started_at);
        const endedMinutes = minutesSinceMidnight(trip.ended_at);
        
        // Include trips that started or ended within 60 minutes of the selected time
        return (
          Math.abs(startedMinutes - timeFilter) <= 60 ||
          Math.abs(endedMinutes - timeFilter) <= 60
        );
    });
}

function computeStationTraffic(stations, trips) {
    const departures = d3.rollup(
        trips, 
        (v) => v.length, 
        (d) => d.start_station_id
    );

    // Computed arrivals as you did in step 4.2
    const arrivals = d3.rollup(
        trips,
        (v) => v.length,
        (d) => d.end_station_id
      );
  
    // Update each station..
    return stations.map((station) => {
      let id = station.short_name;
      station.arrivals = arrivals.get(id) ?? 0;
      station.departures = departures.get(id) ?? 0;
      station.totalTraffic = station.arrivals + station.departures;
      return station;
  });
}