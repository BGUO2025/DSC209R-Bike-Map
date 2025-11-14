import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

const tooltip = d3.select("#tooltip");
if (!tooltip.empty()) {
    console.log("EMPTYYYYYY")
}
// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1IjoiYjZndW8iLCJhIjoiY21odmMycGxjMDhzcTJucHV4aWY3dnBnaSJ9.1-GV6RQBscICW6xswB5R3Q';
// Check that Mapbox GL JS is loaded
console.log('Mapbox GL JS Loaded:', mapboxgl);

// Initialize the map
const map = new mapboxgl.Map({
  container: 'map', // ID of the div where the map will render
  style: 'mapbox://styles/mapbox/streets-v12', // Map style
  center: [-71.09415, 42.36027], // [longitude, latitude]
  zoom: 12, // Initial zoom level
  minZoom: 5, // Minimum allowed zoom
  maxZoom: 18, // Maximum allowed zoom
});
// ------------------------------------------------------------

// Map event listener for map loading
map.on('load', async () => {
    // Feed bike route data to map via Mapbox
    map.addSource('boston_route', {
    type: 'geojson',
    data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
    });

    // Style bike route
    map.addLayer({
        id: 'bike-lanes',
        type: 'line',
        source: 'boston_route',
        paint: {
            'line-color': 'green',
            'line-width': 3,
            'line-opacity': 0.4,
        },
    });
    // ------------------------------------------------------------

    // Feed bike stations and its interativity elements to map via D3.js
    const jsonData = await d3.json(
        'https://dsc106.com/labs/lab07/data/bluebikes-stations.json'
    );
    let stations = jsonData.data.stations;
    console.log(`JSON data:`);
    console.log(stations);

    // Feed bike trip info and its interativity elements to map via D3.js
    // Convert time YYYY-MM-DD HH:MM:SS --> DAY_OF_WEEK MM(ENG) DD YYYY HH(24HR):MM:SS GMT-AREA CODE (Time Zone Name) {}
    // Example: started_at 2024-03-20 08:18:13 --> Wed Mar 20 2024 08:18:13 GMT-0700 (Pacific Daylight Time) {}
    const trips = await d3.csv(    
        'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
        (trip) => {
            trip.started_at = new Date(trip.started_at);
            trip.ended_at = new Date(trip.ended_at);
            return trip;
        }
    );
    console.log(`CSV data:`);
    console.log(trips);

    // Combine trip info into station object
    stations = computeStationTraffic(stations, trips);

    // Define coordinate scale
    // Form: y = ax^(0.5) + b
    // Formula: y = r0 + (r1 - r0) * (x - d0)^(0.5) / (d1 - d0)^(0.5)
    const radiusScale = d3.scaleSqrt()
        .domain([0, d3.max(stations, d => d.totalTraffic)])
        .range([0, 25]);

    const stationFlow = d3.scaleQuantize()
        .domain([0, 1])
        .range([0, 0.5, 1]);

    // Create bike station circle SVG elements via D3.js
    const svg = d3.select('#map').select('svg');
    const circles = svg
        // Feed data
        .selectAll('circle')
        .data(stations, d => d.short_name)
        .enter()
        // Create SVG elements: Circle
        .append('circle')
        // Dimension
        .attr('cx', d => project(map, d).x)
        .attr('cy', d => project(map, d).y)
        .attr('r', d => radiusScale(d.totalTraffic))
        // Styling
        .style('--departure-ratio', (d) => stationFlow(d.departures / d.totalTraffic))
        .attr('stroke', 'white')
        .attr('stroke-width', 1)
        .attr('fill-opacity', 0.6)
        .style('pointer-events', 'auto')
        .on("mouseenter", function(_, d) {
            // Create a new tooltip div dynamically
            const tooltip = d3.select("body")
            .append("div")
            .attr("class", "tooltip")
            .style("position", "absolute")
            .style("pointer-events", "none")
            .style("background", "white")
            .style("padding", "6px 10px")
            .style("border-radius", "6px")
            .style("box-shadow", "0 2px 6px rgba(0,0,0,0.25)")
            .style("font-size", "0.85rem")
            .style("color", "#222")
            .style("opacity", 1);

            // Update content
            tooltip.html(`
                <strong>${d.short_name}</strong><br>
                ${d.totalTraffic} trips<br>
                ${d.departures} departures<br>
                ${d.arrivals} arrivals
            `);

            // Store tooltip on the element for later removal
            this._tooltip = tooltip;

        })
        .on("mousemove", function(event, d) {
            // Move the tooltip with the cursor
            if (this._tooltip) {
                this._tooltip
                    .style("left", (event.clientX + 10) + "px")
                    .style("top", (event.clientY - 10) + "px");
            }
        })
        .on("mouseleave", function() {
            // Remove tooltip when mouse leaves
            if (this._tooltip) {
                this._tooltip.remove();
                this._tooltip = null;
            }
        });

    // Map event listener for manipulating the map
    map.on('viewreset', () => updatePositions(map, circles));
    map.on('move', () => updatePositions(map, circles));
    map.on('moveend', () => updatePositions(map, circles));
    // ------------------------------------------------------------

    // Feed filter data to slider element via D3.js
    const timeSlider = document.getElementById('time-slider');
    const selectedTime = document.getElementById('selected-time');
    const anyTimeLabel = document.getElementById('any-time');

    // DOM event listener for updating time display
    timeSlider.addEventListener('input', () =>
        updateTimeDisplay(
            timeSlider,
            selectedTime,
            anyTimeLabel,
            map,
            svg.selectAll('circle'),
            stations,
            trips,
            radiusScale,
            stationFlow,
            tooltip
        )
    );

    // Initial render
    updateTimeDisplay(
        timeSlider,
        selectedTime,
        anyTimeLabel,
        map,
        svg.selectAll('circle'),
        stations,
        trips,
        radiusScale,
        stationFlow,
        tooltip
    );
});
// ------------------------------------------------------------

// Define geo-coordinate conversion to web-coordinate
// Dependency: N/A
function project(map, station) {
  return map.project([+station.lon, +station.lat]);
}

// Update cx, cy positions dynamically for the circles when doing map manipulation
// Dependency: project() -> pdatePositions()
function updatePositions(map, circles) {
    circles
        .attr('cx', d => project(map, d).x)
        .attr('cy', d => project(map, d).y);
}
// ------------------------------------------------------------

// Compute total mins =  hour * 60 + min * 1
// Dependency: N/A
function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes() * 1;
}

// If NO filter, timeFilter is -1, no action
// If timeFilter is something else, Check if the trip is within 1 hour of selected time
// If YES, keep in filter; if NO, reject out of filter
// Dependency: minutesSinceMidnight() -> filterTripsByTime()
// Example:
//   timeFilter = 900 (3:00 PM)
//   Trip starting at 14:45 (885 min) → included
//   Trip ending at   15:10 (910 min) → included
//   Trip at 12:20 (740 min) → excluded
function filterTripsByTime(trips, timeFilter) {
    if (timeFilter === -1) return trips;
    return trips.filter(trip => {
        // Convert time: DAY_OF_WEEK MM(ENG) DD YYYY HH(24HR):MM:SS GMT-AREA CODE (Time Zone Name) {} --> XYZ Minutes
        // Example: 2024-06-01 14:30:00 -> 870 minutes
        const startM = minutesSinceMidnight(trip.started_at);
        const endM = minutesSinceMidnight(trip.ended_at);
        return (
            Math.abs(startM - timeFilter) <= 60 ||
            Math.abs(endM - timeFilter) <= 60
        );
    });
}

// Combine trip info into station object
// Dependency: N/A
function computeStationTraffic(stations, trips) {
    // Group departure id by sum up numbers of departure occurrence
    const departures = d3.rollup(
        trips,
        v => v.length,
        d => d.start_station_id
    );

    // Same above, but for arrivals
    const arrivals = d3.rollup(
        trips,
        v => v.length,
        d => d.end_station_id
    );

    // Combine departures, arrivals, and their sum total traffic to station object
    return stations.map(
        station => {
            const id = station.short_name;
            station.arrivals = arrivals.get(id) ?? 0;
            station.departures = departures.get(id) ?? 0;
            station.totalTraffic = station.arrivals + station.departures;
            return station;
        }
    );
}

// Update the bike station circle SVG elements via D3.js from filtered data
// Dependency: minutesSinceMidnight() -> [filterTripsByTime(), computeStationTraffic()]
// -> updateScatterPlot()
function updateScatterPlot(map, circles, stations, trips, radiusScale, timeFilter, stationFlow, tooltip) {
    // Get filtered trip data
    const filteredTrips = filterTripsByTime(trips, timeFilter);
    // Integrate trip data to station data
    const filteredStations = computeStationTraffic(stations, filteredTrips);

    // If No filter
    timeFilter === -1
        // Normal Size for Circle
        ? radiusScale.range([0, 25])
        // Dynamic Size based on filtering
        : radiusScale.range([3, 50]);

    circles
        // Feed data
        .data(filteredStations, d => d.short_name)
        // Create SVG elements
        .join('circle')
        // Dimension
        .attr('r', d => radiusScale(d.totalTraffic))
        .attr('cx', d => project(map, d).x)
        .attr('cy', d => project(map, d).y)
        .style('--departure-ratio', (d) => stationFlow(d.departures / d.totalTraffic))
        // Create Tooltip
        .on("mouseenter", function(_, d) {
            // Create a new tooltip div dynamically
            const tooltip = d3.select("body")
            .append("div")
            .attr("class", "tooltip")
            .style("position", "absolute")
            .style("pointer-events", "none")
            .style("background", "white")
            .style("padding", "6px 10px")
            .style("border-radius", "6px")
            .style("box-shadow", "0 2px 6px rgba(0,0,0,0.25)")
            .style("font-size", "0.85rem")
            .style("color", "#222")
            .style("opacity", 1);

            // Update content
            tooltip.html(`
                <strong>${d.short_name}</strong><br>
                ${d.totalTraffic} trips<br>
                ${d.departures} departures<br>
                ${d.arrivals} arrivals
            `);

            // Store tooltip on the element for later removal
            this._tooltip = tooltip;

        })
        .on("mousemove", function(event, d) {
            // Move the tooltip with the cursor
            if (this._tooltip) {
                this._tooltip
                    .style("left", (event.clientX + 10) + "px")
                    .style("top", (event.clientY - 10) + "px");
            }
        })
        .on("mouseleave", function() {
            // Remove tooltip when mouse leaves
            if (this._tooltip) {
                this._tooltip.remove();
                this._tooltip = null;
            }
        });
}

// Create dummy date with defined mins
// First with X mins, Convert it Date 1900-01-01 midnight(12:00) + X mins 
// -->to US style (12-hour clock, AM/PM), shorten it to Hr & Mins
// Example: numbers of min 16 -> 1900-01-01 midnight(12:00) + 16mins -> 12:MM AM/PM
// Dependency: N/A
function formatTime(minutes) {
    const date = new Date(0, 0, 0, 0, minutes);
    return date.toLocaleString('en-US', { timeStyle: 'short' });
}

// Dependency: minutesSinceMidnight() -> [filterTripsByTime(), computeStationTraffic()]
// -> [updateScatterPlot(), formatTime()] -> updateTimeDisplay()
function updateTimeDisplay(timeSlider, selectedTime, anyTimeLabel, map, circles, stations, trips, radiusScale, stationFlow, tooltip) {
    // Extract filter time
    const timeFilter = Number(timeSlider.value);

    // If no filter, 
    if (timeFilter === -1) {
        // No show time
        selectedTime.textContent = '';
        anyTimeLabel.textContent = '(any time)';
        
        // anyTimeLabel.style.display = 'inline';
    } 
    // If filter is done
    else {
        // Show time
        selectedTime.textContent = formatTime(timeFilter);
        anyTimeLabel.textContent = '';
        // anyTimeLabel.style.display = 'none';
    }

    // Update the circles with time filter and other necessary object to be passed down
    updateScatterPlot(
        map, 
        circles, 
        stations, 
        trips, 
        radiusScale, 
        timeFilter,
        stationFlow
    );
}