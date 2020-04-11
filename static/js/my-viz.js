$(function () {
    // fetch data
    queue()
        .defer(d3.json, "static/data/us.json")
        .defer(d3.csv, "static/data/merged_data.csv")
        .await(dataLoaded);

    function dataLoaded(err, us, data) {
        // map FIP codes/names to data records &
        // ensure proper data types
        var fipsToData = {};
        var namesToFips = {};
        data.forEach(function (d) {
            // state fips is 2 digits, county fips is 3 digits
            var stateFips = d['StateCodeFIPS'];
            var countyFips = d['MunicipalCodeFIPS'];

            stateFips = padWithLeadingZeros(stateFips, 2);
            countyFips = padWithLeadingZeros(countyFips, 3);

            var fips = stateFips + countyFips;
            d['FIPS'] = fips;
            d['StateCodeFIPS'] = stateFips;
            d['MunicipalCodeFIPS'] = countyFips;
            fipsToData[fips] = d;

            var name = d['RegionName'] + ', ' + d['State'];
            d['Name'] = name;
            namesToFips[name] = fips;

            // convert to numeric values
            for (var field in d) {
                if (['RegionID', 'RegionName', 'State', 'Metro', 'StateCodeFIPS', 'MunicipalCodeFIPS', 'FIPS', 'Name'].includes(field)) {
                    continue;
                }

                d[field] = parseFloat(d[field]);
            }
        });

        // populate dropdown
        var $menu = $('#county-dropdown .menu');
        Object.keys(namesToFips).sort().forEach(function (name) {
            var fips = namesToFips[name];
            var $item = $(`<div class="item" data-value="${fips}">${name}</div>`);
            $menu.append($item);
        });

        // enable dropdown
        $('.ui.dropdown').dropdown();

        // update selection on map when dropdown changes
        $('#county-dropdown').dropdown('setting', 'onChange', function (fips) {
            selectedFips = fips;

            // get active viz
            var viz = $('.panel.active').attr('data-viz');
            renderActive(viz, false);
        });

        $('#attribute-dropdown').dropdown('setting', 'onChange', function (attribute) {
            svg.selectAll('.data').remove();
            renderState(attribute, true);
        });

        const width = 975;
        const height = 610;
        const propertyValueColumn = '2020-01';
        const selectionColor = '#21a4a2';
        const highlightColor = '#cd3d8b';
        const noDataColor = '#eee';
        const usMedian = d3.median(data, d => d[propertyValueColumn]);

        var svg = d3.select("#viz")
            .append("svg")
            .attr("viewBox", `0 0 ${width} ${height}`);

        var selectedFips = null;
        var projection = d3.geoAlbersUsa();
        var path = d3.geoPath(projection);
        var max = d3.max(data, d => d[propertyValueColumn]);
        var extent = [0, max];
        var color = d3.scaleSequential();

        color.domain(extent)
            .interpolator(d3.interpolateRdPu);

        var margin = {
            top: 50,
            left: 100,
            right: 50,
            bottom: 200
        };

        var tooltip = d3.select("body")
            .append("div")
            .attr("class", "tooltip")
            .style("opacity", 0);

        function renderUS(refresh) {
            if (selectedFips) {
                $('.hidden').removeClass('hidden');
                $('#scroll-indicator').addClass('flash');
                $('.no-scroll').removeClass('no-scroll');
            }

            var features = topojson.feature(us, us.objects.counties).features;
            var stateFeatures = topojson.feature(us, us.objects.states).features;
            if (refresh) {
                // remove current data
                svg.selectAll('.data')
                    .data([])
                    .exit()
                    .transition()
                    .duration(750)
                    .delay(() => Math.floor(Math.random() * 500))
                    .attr('opacity', '0')
                    .remove();

                // draw county outlines
                var bind = svg.selectAll('.data.county')
                    .data(features, d => d.id);

                bind.enter()
                    .append('path')
                    .attr('class', 'data county')
                    .attr('d', path)
                    .attr('stroke', 'white')
                    .attr('stroke-width', '.7')
                    .attr('opacity', '0')
                    .attr('data-fips', function (d) {
                        return padWithLeadingZeros(d.id, 5);
                    })
                    .attr('fill', function (d) {
                        var fips = padWithLeadingZeros(d.id, 5);
                        if (fips in fipsToData) {
                            var value = fipsToData[fips][propertyValueColumn];
                            return color(value);
                        }

                        return noDataColor;
                    })
                    .on('click', function () {
                        var fips = d3.select(this).attr('data-fips');
                        if (fips in fipsToData) {
                            selectedFips = fips;
                            renderUS(false);
                        }
                    })
                    .on('mouseover', function (d) {
                        var fips = padWithLeadingZeros(d.id, 5);
                        var regionData = fipsToData[fips];
                        if (!regionData) {
                            tooltip.transition()
                                .duration(300)
                                .style("opacity", 0);
                            return;
                        }

                        tooltip.html('');
                        tooltip.append('div').attr('class', 'name').text(regionData['Name']);
                        tooltip.append('div').attr('class', 'data').text(toCurrency(regionData[propertyValueColumn]));

                        tooltip.style("left", (d3.event.pageX + 30) + "px")
                            .style("top", (d3.event.pageY - 30) + "px");

                        tooltip.transition()
                            .duration(300)
                            .style("opacity", 1);
                    })
                    .on('mouseout', function () {
                        tooltip.transition()
                            .duration(300)
                            .style("opacity", 0);
                    })
                    .transition()
                    .duration(750)
                    .delay(() => Math.floor(Math.random() * 500))
                    .attr('opacity', '1');

                // draw state outlines
                bind = svg.selectAll('.state.data')
                    .data(stateFeatures, d => d.id);

                bind.enter()
                    .append('path')
                    .attr('class', 'data state')
                    .attr('stroke', '#ccc')
                    .attr('pointer-events', 'none')
                    .attr('stroke-width', '1px')
                    .attr('d', path)
                    .attr('fill', 'transparent');

                bind.exit()
                    .transition()
                    .duration(750)
                    .delay(() => Math.floor(Math.random() * 500))
                    .attr('opacity', '0')
                    .remove();

                svg.selectAll('.aux, .line')
                    .attr('opacity', '1')
                    .transition()
                    .duration(750)
                    .attr('opacity', '0')
                    .remove();

                var interpolator = d3.interpolateNumber(extent[0], extent[1]);
                var legendData = [null];

                for (var i = 0.0; i <= 1.0; i += 1.0 / 10) {
                    legendData.push(Math.floor(interpolator(i)));
                }

                var legend = svg.selectAll('g.legend')
                    .data(legendData)
                    .enter()
                    .append('g')
                    .attr('class', 'legend')
                    .attr('transform', 'translate(100, 0)');

                legend.append('rect')
                    .attr('x', (d, i) => (i * 50))
                    .attr('y', 550)
                    .attr('width', 50)
                    .attr('height', 20)
                    .style('fill', d => d === null ? noDataColor : color(d));

                legend.append('text')
                    .attr('x', (d, i) => ((i * 50) + (50 / 2)))
                    .attr('y', 590)
                    .attr('text-anchor', 'middle')
                    .text((d, i) => d === null ? 'No Data' : toShortCurrency(d));

                legend.append('text')
                    .attr('x', 5)
                    .attr('y', 540)
                    .attr('class', 'legend-title')
                    .text('January 2020 Median Home Values');
            }

            bind = svg.selectAll('.selected')
                .data(features.filter(d => padWithLeadingZeros(d.id, 5) === selectedFips), d => d.id);

            bind.enter()
                .append('path')
                .attr('d', path)
                .attr('stroke', selectionColor)
                .attr('stroke-width', '4')
                .attr('class', 'selected')
                .attr('fill', 'transparent')
                .attr('pointer-events', 'none');

            bind.exit()
                .transition()
                .duration(750)
                .attr('opacity', '0')
                .remove();

            $('#county-dropdown').dropdown('set selected', selectedFips);
        }

        function renderBarChart() {
            var stateFips = selectedFips.substring(0, 2);
            svg.on('mousemove', null);

            // filter on state and order by value descending
            var counties = data
                .filter(d => d['StateCodeFIPS'] === stateFips)
                .sort((a, b) => b[propertyValueColumn] - a[propertyValueColumn]);

            var stateMedian = d3.median(counties, d => d[propertyValueColumn]);

            // clear out svg
            svg.selectAll('.aux, .legend')
                .style('opacity', '1')
                .transition()
                .duration(750)
                .style('opacity', '0')
                .remove();

            // bar chart
            function countyName(c) {
                return c.replace(/\s+County\s*$/, '');
            }

            var extent = d3.extent(counties, d => d[propertyValueColumn]);
            if (usMedian < extent[0]) {
                extent[0] = usMedian;
            }

            // adjust minimum value to give more height to smaller bars
            extent[0] *= .75;

            var yScale = d3.scaleLinear()
                .domain(extent)
                .range([height - margin.bottom, margin.top]);
            var xScale = d3.scaleBand()
                .domain(counties.map(d => countyName(d['RegionName'])))
                .range([margin.left, width - margin.right])
                .padding(0.1);

            bind = svg.selectAll('.data, .selected')
                .data(counties, d => parseInt(d['FIPS']));

            bind.enter()
                .insert('rect', ':first-child')
                .attr('class', 'data bar')
                .attr('height', '0')
                .attr('data-fips', d => d['FIPS'])
                .attr('width', d => xScale.bandwidth())
                .attr('x', (d, i) => xScale(countyName(counties[i]['RegionName'])))
                .attr('y', height - margin.bottom)
                .attr('fill', 'pink')
                .on('mouseover', function (d) {
                    var fips = d['FIPS'];
                    var regionData = fipsToData[fips];
                    if (!regionData) {
                        tooltip.transition()
                            .duration(300)
                            .style("opacity", 0);
                        return;
                    }

                    tooltip.html('');
                    tooltip.append('div').attr('class', 'name').text(regionData['Name']);
                    tooltip.append('div').attr('class', 'data').text(toCurrency(regionData[propertyValueColumn]));

                    tooltip.style("left", (d3.event.pageX + 30) + "px")
                        .style("top", (d3.event.pageY - 30) + "px");

                    tooltip.transition()
                        .duration(300)
                        .style("opacity", 1);
                })
                .on('mouseout', function () {
                    tooltip.transition()
                        .duration(300)
                        .style("opacity", 0);
                })
                .transition()
                .duration(750)
                .attr('height', function (d) {
                    var y = yScale(d[propertyValueColumn]);
                    return height - y - margin.bottom;
                })
                .attr('y', d => yScale(d[propertyValueColumn]));

            bind.exit()
                .transition()
                .duration(750)
                .delay(() => Math.floor(Math.random() * 500))
                .style('opacity', '0')
                .remove();

            bind = svg.selectAll('rect.selected')
                .data(counties.filter(d => d['FIPS'] === selectedFips), d => d['FIPS']);

            bind.enter()
                .insert('rect', 'path.line')
                .attr('class', 'data bar selected')
                .attr('fill', selectionColor)
                .attr('height', function (d) {
                    var y = yScale(d[propertyValueColumn]);
                    return height - y - margin.bottom;
                })
                .attr('width', d => xScale.bandwidth())
                .attr('x', d => xScale(countyName(d['RegionName'])))
                .attr('y', d => yScale(d[propertyValueColumn]))
                .attr('opacity', '0')
                .attr('pointer-events', 'none')
                .transition()
                .duration(750)
                .attr('opacity', '1');


            bind.exit()
                .transition()
                .duration(750)
                .attr('opacity', '0')
                .remove();

            // median line
            var line = d3.line()
                .x((d, i) => i == 0 ? margin.left : width - margin.right)
                .y((d, i) => yScale(d));

            svg.append('path')
                .attr('fill', 'none')
                .attr('class', 'aux')
                .attr('stroke', '#888')
                .attr('stroke-width', '2')
                .attr('d', line([usMedian, usMedian]));

            // see if line already exists
            var medianLine = svg.selectAll('path.line');

            if (medianLine.size() > 0) {
                // animate from current trend line median line (scrolling up)
                medianLine.attr('fill', 'none')
                    .attr('class', 'line')
                    .attr('stroke', highlightColor)
                    .attr('stroke-width', '2')
                    .transition()
                    .duration(750)
                    .attrTween('d', function (d) {
                        var previous = d3.select(this).attr('d');
                        var current = line([stateMedian, stateMedian]);

                        return d3.interpolatePath(previous, current);
                    });
            }
            else {
                // add trend line (scrolling down)
                svg.append('path')
                    .attr('class', 'line')
                    .attr('fill', 'none')
                    .attr('stroke', highlightColor)
                    .attr('stroke-width', '2')
                    .attr('d', line([stateMedian, stateMedian]));
            }

            // append median labels
            svg.append('text')
                .attr('class', 'aux text')
                .attr('stroke', '#888')
                .attr('text-anchor', 'end')
                .attr('alignment-baseline', 'baseline')
                .attr('x', width - margin.right)
                .attr('y', yScale(usMedian) - 3)
                .text(`US Median`);

            var county = fipsToData[selectedFips];
            var state = county['State'];

            svg.append('text')
                .attr('class', 'aux text')
                .attr('stroke', highlightColor)
                .attr('text-anchor', 'end')
                .attr('alignment-baseline', 'baseline')
                .attr('x', width - margin.right)
                .attr('y', yScale(stateMedian) - 3)
                .text(`${state} Median`);

            // draw axes
            svg.append('g')
                .attr('class', 'axis aux')
                .attr("transform", `translate(0,${(height - margin.bottom)})`)
                .call(d3.axisBottom(xScale))
                .selectAll('text')
                .style('text-anchor', 'end')
                .attr('transform', 'rotate(-45) translate(-5,0)');

            svg.append('g')
                .attr('class', 'axis aux')
                .attr('transform', `translate(${margin.left}, 0)`)
                .call(d3.axisLeft(yScale).tickFormat(toShortCurrency));
        }

        function renderLineChart() {
            var county = data.filter(d => d['FIPS'] === selectedFips)[0];
            var parseDate = d3.timeParse('%Y-%m');

            var propertyValues = [];
            var nullValues = [];
            for (var i = 1996; i <= 2020; i++) {
                for (var j = 1; j <= 12; j++) {
                    var date = `${i}-${padWithLeadingZeros(j, 2)}`;
                    var value = county[date];

                    // if value was null and we haven't added any data yet
                    // just skip it
                    if (!value) {
                        // save null values and only add them if we see another value
                        // ie we aren't at the end of the list of dates
                        if (propertyValues.length > 0) {
                            nullValues.push(date);
                        }

                        continue;
                    }

                    for (var k = 0; k < nullValues.length; k++) {
                        propertyValues.push({
                            date: parseDate(nullValues[i]),
                            value: null
                        });
                    }

                    propertyValues.push({
                        date: parseDate(date),
                        value: value,
                    });
                }
            }

            var timeExtent = d3.extent(propertyValues, d => d.date);
            var valueExtent = d3.extent(propertyValues, d => d.value);

            valueExtent[0] *= .75;
            valueExtent[1] *= 1.20;

            var xScale = d3.scaleTime()
                .domain(timeExtent)
                .range([margin.left, width - margin.right]);
            var yScale = d3.scaleLinear()
                .domain(valueExtent)
                .range([height - margin.bottom, margin.top]);

            var line = d3.line()
                .x(d => xScale(d.date))
                .y(d => yScale(d.value));

            svg.selectAll('.data, .aux')
                .style('opacity', '1')
                .transition()
                .duration(750)
                .delay(() => Math.floor(Math.random() * 500))
                .attr('opacity', '0')
                .remove();

            svg.selectAll('.legend')
                .remove();

            // see if line already exists
            var median = svg.selectAll('path.line')
                .datum(propertyValues);

            var path;

            if (median.size() > 0) {
                // animate median line to current trend line (scrolling down)
                path = median.attr('fill', 'none')
                    .attr('class', 'line')
                    .attr('stroke', highlightColor)
                    .attr('stroke-width', '2')
                    .attr('stroke-linejoin', 'miter');

                path.transition()
                    .duration(750)
                    .attrTween('d', function (d) {
                        var previous = d3.select(this).attr('d');
                        var current = line(d);

                        return d3.interpolatePath(previous, current);
                    });
            }
            else {
                // add trend line (scrolling up)
                path = median.append('path')
                    .attr('class', 'line')
                    .attr('fill', 'none')
                    .attr('stroke', highlightColor)
                    .attr('stroke-width', '2')
                    .attr('d', line);
            }

            var fmt = d3.timeFormat('%B %Y');
            var bisectDate = d3.bisector(d => d.date).left;

            svg
                .on('mouseover', function (d) {
                    tooltip.transition()
                        .duration(300)
                        .style("opacity", 1);
                })
                .on('mouseout', function () {
                    tooltip.transition()
                        .duration(300)
                        .style("opacity", 0);
                })
                .on('mousemove', function () {
                    var x = xScale.invert(d3.mouse(this)[0]);
                    var i = bisectDate(propertyValues, x, 1);

                    var datum = propertyValues[i];

                    tooltip.html('');
                    tooltip.append('div').attr('class', 'name').text(fmt(datum.date));
                    tooltip.append('div').attr('class', 'data').text(toCurrency(datum.value));

                    tooltip.style("left", (d3.event.pageX + 30) + "px")
                        .style("top", (d3.event.pageY - 30) + "px");
                });

            // draw axes
            svg.append('g')
                .attr('class', 'axis aux')
                .attr("transform", `translate(0,${(height - margin.bottom)})`)
                .call(d3.axisBottom(xScale).tickFormat(d3.timeFormat('%b %Y')));

            svg.append('g')
                .attr('class', 'axis aux')
                .attr('transform', `translate(${margin.left}, 0)`)
                .call(d3.axisLeft(yScale).tickFormat(toShortCurrency));
        }

        function renderState(attribute = null, immediate = false) {
            if (!attribute) {
                attribute = 'Population';
            }
            $('#attribute-dropdown').dropdown('set selected', attribute);

            svg.on('mousemove', null);

            var stateFips = selectedFips.substring(0, 2);
            var stateFipsInt = parseInt(stateFips);

            // get bounds of state
            var stateMap = topojson.feature(us, us.objects.states).features.filter(x => x.id === stateFipsInt);
            var statePath = d3.geoPath(d3.geoAlbersUsa().scale(1).translate([0, 0]));
            var b = statePath.bounds(stateMap[0]);
            var s = 0.75 / Math.max((b[1][0] - b[0][0]) / width, (b[1][1] - b[0][1]) / height);
            var t = [(width - s * (b[1][0] + b[0][0])) / 2, (height - s * (b[1][1] + b[0][1])) / 2];


            // get counties of state
            var counties = topojson.feature(us, us.objects.counties).features
                .filter(x => padWithLeadingZeros(x.id, 5).substring(0, 2) === stateFips);

            var projection = d3.geoAlbersUsa()
                .scale(s)
                .translate(t);

            var path = d3.geoPath(projection);
            var stateData = data.filter(d => d['StateCodeFIPS'] == stateFips);
            var extent = d3.extent(stateData, d => d[attribute]);
            var color = d3.scaleSequential();

            var formatters = {
                'Population': { fmt: toShortNumber, desc: 'Population: ', title: '2013 Population' },
                'Unemployed Rate': { fmt: (n) => toPercent(n, 100), desc: 'Unemployment Rate: ', title: '2016 Unemployment Rate' },
                'CrimeRatePer100000': { fmt: (n) => toPercent(n, 100000), desc: 'Crime Rate Per 100,000: ', title: '2016 Crime Rate per 100k' },
            };

            var fmt = { desc: '', fmt: toShortNumber, title: '' };
            if (attribute in formatters) {
                fmt = formatters[attribute];
            }

            color.domain(extent)
                .interpolator(d3.interpolateRdPu);

            // transition trend line to state outline
            svg.selectAll('.line')
                .transition()
                .duration(750)
                .attr('stroke-linejoin', 'round')
                .attrTween('d', function (d) {
                    var previous = d3.select(this).attr('d');
                    var shapes = stateMap.map(d => path(d));

                    return d3.interpolatePath(previous, shapes[0]);
                });

            var bind = svg.selectAll('.data')
                .data(counties, d => d.id);

            bind.enter()
                .insert('path', ':first-child')
                .attr('class', 'data county')
                .attr('d', path)
                .attr('stroke', 'white')
                .attr('stroke-width', '.7')
                .attr('stroke-linejoin', 'round')
                .attr('opacity', '0')
                .attr('data-fips', function (d) {
                    return padWithLeadingZeros(d.id, 5);
                })
                .attr('fill', function (d) {
                    var fips = padWithLeadingZeros(d.id, 5);
                    if (fips in fipsToData) {
                        var value = fipsToData[fips][attribute];
                        if (value) {
                            return color(value);
                        }
                    }

                    return noDataColor;
                })
                .on('mouseover', function (d) {
                    var fips = padWithLeadingZeros(d.id, 5);
                    var regionData = fipsToData[fips];
                    if (!regionData) {
                        tooltip.transition()
                            .duration(300)
                            .style("opacity", 0);
                        return;
                    }

                    tooltip.html('');
                    tooltip.append('div').attr('class', 'name').text(regionData['Name']);
                    tooltip.append('div').attr('class', 'data').text(fmt.fmt(regionData[attribute]));

                    tooltip.style("left", (d3.event.pageX + 30) + "px")
                        .style("top", (d3.event.pageY - 30) + "px");

                    tooltip.transition()
                        .duration(300)
                        .style("opacity", 1);
                })
                .on('mouseout', function () {
                    tooltip.transition()
                        .duration(300)
                        .style("opacity", 0);
                })
                .transition()
                .duration(750)
                .delay(() => (immediate ? 0 : 750) + Math.floor(Math.random() * 500))
                .attr('opacity', '1');

            bind.exit()
                .transition()
                .delay(() => (immediate ? 0 : 750) + Math.floor(Math.random() * 500))
                .attr('opacity', '0')
                .remove();

            svg.selectAll('.aux:not(.selected)')
                .attr('opacity', '1')
                .transition()
                .duration(750)
                .attr('opacity', '0')
                .remove();

            svg.selectAll('path.selected').remove();

            svg.selectAll('path.selected')
                .data(counties.filter(d => padWithLeadingZeros(d.id, 5) === selectedFips))
                .enter()
                .append('path')
                .attr('d', path)
                .attr('stroke', selectionColor)
                .attr('stroke-width', '4')
                .attr('class', 'selected aux')
                .attr('fill', 'transparent')
                .attr('opacity', '0')
                .attr('pointer-events', 'none')
                .transition()
                .delay(() => (immediate ? 0 : 750) + Math.floor(Math.random() * 500))
                .attr('opacity', '1');

            var interpolator = d3.interpolateNumber(extent[0], extent[1]);
            var legendData = [null];

            for (var i = 0.0; i <= 1.0; i += 1.0 / 10) {
                legendData.push(Math.floor(interpolator(i)));
            }

            svg.selectAll('g.legend, .legend-title')
                .remove();

            var legend = svg
                .selectAll('g.legend')
                .data(legendData)
                .enter()
                .append('g')
                .attr('class', 'legend');

            legend.append('rect')
                .attr('x', (d, i) => (i * 50))
                .attr('y', 550)
                .attr('width', 50)
                .attr('height', 20)
                .style('fill', d => d === null ? noDataColor : color(d));

            legend.append('text')
                .attr('x', (d, i) => ((i * 50) + (50 / 2)))
                .attr('y', 590)
                .attr('text-anchor', 'middle')
                .text((d, i) => d === null ? 'No Data' : fmt.fmt(d));

            svg.append('text')
                .attr('x', 5)
                .attr('y', 540)
                .attr('class', 'legend-title aux')
                .text(fmt.title);
        }

        function renderActive(viz, refresh) {
            switch (viz) {
                case 'us':
                    renderUS(refresh);
                    break;
                case 'bar':
                    renderBarChart();
                    break;

                case 'line':
                    renderLineChart();
                    break;

                case 'state':
                    renderState();
                    break;
            }

            if (selectedFips) {
                var county = fipsToData[selectedFips];
                var name = county['Name'];
                var state = county['State'];
                var stateName = stateNames[state];

                $('.county-selection').html(name);
                $('.state-selection').html(stateName);
            }
        }

        // initialize scrolling animations
        var controller = new ScrollMagic.Controller();
        var slides = document.querySelectorAll("section.panel");

        // create scene for every slide
        for (var i = 0; i < slides.length; i++) {
            new ScrollMagic.Scene({
                triggerElement: slides[i],
                duration: '75%',
            })
                .addTo(controller)
                .setClassToggle(slides[i], 'active')
                .on("enter leave", function (e) {
                    if (e.type !== 'enter') {
                        return;
                    }
                    var $target = $(e.target.triggerElement());
                    var viz = $target.attr('data-viz');

                    renderActive(viz, true);
                })
                .on("start end", function (e) {
                })
                .on("progress", function (e) {
                    //console.log(`scroll progress ${e.progress.toFixed(3)}`);
                });
        }

        new ScrollMagic.Scene({
            triggerElement: '#header',
            triggerHook: 'onLeave',
        })
            .setPin('#header', { pushFollowers: false })
            .setClassToggle('#header', 'header')
            .addTo(controller);
    };
});
