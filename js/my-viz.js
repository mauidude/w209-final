// Shorthand for $( document ).ready()
$(function () {
    class Visualization {
        constructor() {
            this._onClick = null;
        }

        set data(data) {
            this._data = data;
        }

        get data() {
            return this._data;
        }

        onClick(fn) {
            this._onClick = fn;
        }

        render(svg) { }
    }

    class Legend extends Visualization {
        constructor(x, y, title, width, height, segments, fmt, horizontal = true) {
            super();
            this.x = x;
            this.y = y;
            this.title = title;
            this.width = width;
            this.height = height;
            this.segments = segments;
            this.horizontal = horizontal;
            this.fmt = fmt;
        }

        set scale(scale) {
            this._scale = scale;
        }

        set extent(extent) {
            this._extent = extent;
        }

        render(svg) {
            var interpolator = d3.interpolateNumber(this._extent[0], this._extent[1]);
            var legendData = [];
            var step = 1.0 / this.segments;

            for (var i = 0.0; i <= 1.0; i += step) {
                legendData.push(Math.floor(interpolator(i)));
            }

            var that = this;

            var legend = svg.selectAll("g.legend")
                .data(legendData)
                .enter().append("g")
                .attr("class", "legend");

            legend.append("rect")
                .attr("x", (d, i) => that.horizontal ? (i * that.width) : that.x)
                .attr("y", (d, i) => that.horizontal ? that.y + 5 : (i * that.height))
                .attr("width", this.width)
                .attr("height", this.height)
                .style("fill", function (d) { return that._scale(d); });

            legend.append("text")
                .attr("x", (d, i) => that.horizontal ? ((i * that.width) + (that.width / 2)) : that.x + that.width + 5)
                .attr("y", (d, i) => that.horizontal ? that.y + that.height + 20 : ((i * that.height) + (that.height / 2)))
                .attr('text-anchor', () => that.horizontal ? 'middle' : 'auto')
                .attr('alignment-baseline', () => that.horizontal ? 'auto' : 'central')
                .text(this.fmt);

            svg.append("text")
                .attr("x", this.x)
                .attr("y", this.y)
                .attr("class", "legend-title")
                .text(function () { return that.title; });
        }
    }

    class Choropleth extends Visualization {
        // data format for choropleth is:
        // {
        //      "fipsCode": {"value": <value>, "name": <name>}
        // }
        constructor(projection, geo, legend, tooltipFormatter, interpolator = d3.interpolateBlues) {
            super();
            this.projection = projection;
            this.geo = geo;
            this.interpolator = interpolator;
            this.$selected = null;
            this.legend = legend;
            this.tooltipFormatter = tooltipFormatter;
        }

        render(svg) {
            var path = d3.geoPath(this.projection);
            var color = d3.scaleSequential();

            var extent = d3.extent(Object.values(this.data).map(x => x.value));

            color.domain(extent).
                interpolator(this.interpolator);

            var tooltip = d3.select("body").append("div")
                .attr("class", "tooltip")
                .style("opacity", 0);

            var that = this;

            function initialize(d3obj) {
                return d3obj.attr('data-fips', function (d) {
                    return padWithLeadingZeros(d.id, 5);
                })
                    .attr("fill", function (d) {
                        var fips = padWithLeadingZeros(d.id, 5);

                        if (fips in that.data) {
                            var value = that.data[fips].value;
                            return color(parseInt(value));
                        }

                        //console.log(fips);
                        return 'gray';
                    })
                    .on('mouseover', function (d) {
                        var fips = padWithLeadingZeros(d.id, 5);
                        var regionData = that.data[fips];
                        if (!regionData) {
                            tooltip.transition()
                                .duration(300)
                                .style("opacity", 0);
                            return;
                        }

                        tooltip.html('');
                        tooltip.append('div').attr('class', 'name').text(regionData.name);
                        tooltip.append('div').attr('class', 'data').text(that.tooltipFormatter(regionData));

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
                    });
            }

            if (!this.rendered) {
                var map = svg.append("g")
                    .attr("class", "county")
                    .selectAll("path")
                    .data(this.geo)
                    .enter()
                    .append("path")
                    .attr("d", path)
                    .attr('stroke', 'gray')
                    .attr('stroke-width', '1')
                    .on('click', function () {
                        var path = d3.select(this);
                        var fips = path.attr('data-fips');

                        if (fips in that.data) {
                            that.select(fips);
                            that.render(svg);

                            if (that._onClick) {
                                that._onClick(path);
                            }
                        }
                    });

                initialize(map);
                this.rendered = true;
            }

            // redraw selection each time
            svg.selectAll("path.selected").data([]).exit().remove();

            var selection = svg
                .selectAll("path.selected")
                .data(this.geo.filter(d => padWithLeadingZeros(d.id, 5) === this.selectedFips))
                .enter()
                .append("path")
                .attr("d", path)
                .attr('stroke', 'black')
                .attr('stroke-width', '2')
                .attr('class', 'selected');

            initialize(selection)

            if (this.legend) {
                this.legend.scale = color;
                this.legend.extent = extent;
                this.legend.render(svg);
            }
        }

        select(fips) {
            this.selectedFips = fips;
        }
    }

    var projection = d3.geoAlbersUsa();
    var width = 975;
    var height = 610;

    var usChoroplethSvg = d3.select("#usChoropleth")
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`);
    var stateChoroplethSvg = d3.select("#stateChoropleth")
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`);

    queue()
        .defer(d3.json, "data/us.json")
        .defer(d3.csv, "data/merged_data.csv")
        .await(dataLoaded);

    function padWithLeadingZeros(n, length) {
        var s = n.toString();
        while (s.length < length) {
            s = "0" + s;
        }

        return s;
    }

    function toCurrency(n) {
        return '$' + Number(n.toFixed(0)).toLocaleString();
    }

    function toShortCurrency(n) {
        var fmt = '($0a)';
        if (n > 1000000) {
            fmt = '($0.0a)';
        }
        return numeral(n).format(fmt);
    }

    function toShortNumber(n) {
        var fmt = '(0a)';
        if (n > 1000000) {
            fmt = '(0.0a)';
        }
        return numeral(n).format(fmt);
    }

    function toPercent(n, divisor = 100) {
        var fmt = '0.00%';
        return numeral(n / divisor).format(fmt);
    }

    function dataLoaded(error, us, data) {
        var valueColumn = '2020-01';

        // map FIP codes/names to data records
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
        });

        // convert to numeric values
        data.forEach(function (d) {
            for (var field in d) {
                if (['RegionID', 'RegionName', 'State', 'Metro', 'StateCodeFIPS', 'MunicipalCodeFIPS', 'FIPS', 'Name'].includes(field)) {
                    continue;
                }

                d[field] = parseFloat(d[field]);
            }
        });

        function selectionChanged(fips, attribute = null) {
            // update choropleth
            usChoropleth.select(fips);
            usChoropleth.render(usChoroplethSvg);

            if (!attribute) {
                attribute = $('#attribute-dropdown').dropdown('get value');;
            }

            // update dropdown
            $('#county-dropdown').dropdown('set selected', fips);
            initializeStateChoropleth(fips, attribute);
        }

        // populate dropdown
        var $menu = $('#county-dropdown .menu');
        Object.keys(namesToFips).sort().forEach(function (name) {
            var fips = namesToFips[name];
            var $item = $(`<div class="item" data-value="${fips}">${name}</div>`);
            $menu.append($item);
        });

        // enable dropdown
        $('.ui.dropdown').dropdown();

        $('#county-dropdown').dropdown('setting', 'onChange', function (fips) {
            selectionChanged(fips);
        });


        $('#attribute-dropdown').dropdown('setting', 'onChange', function (attr) {
            var fips = $('#county-dropdown').dropdown('get value');;
            selectionChanged(fips, attr);
        });

        // build US choropleth
        var legend = new Legend(0, 540, 'January 2020 Median Home Prices', 75, 20, 10, toShortCurrency);
        var usChoropleth = new Choropleth(projection,
            topojson.feature(us, us.objects.counties).features,
            legend,
            (d) => 'Median Sale Price: ' + toCurrency(d.value));
        var fipsToValue = data.reduce((obj, row) => {
            var fips = row['FIPS'];
            var value = row[valueColumn];
            var name = row['Name'];

            return Object.assign(obj, { [fips]: { value: value, name: name } });
        }, {});

        usChoropleth.onClick(path => {
            var fips = path.attr('data-fips');
            selectionChanged(fips);
        });
        usChoropleth.data = fipsToValue;
        usChoropleth.render(usChoroplethSvg);

        function initializeStateChoropleth(fips, attribute) {
            var stateFips = fips.substring(0, 2);
            var countyFips = fips.substring(2);

            // clear svg
            $(stateChoroplethSvg.node()).empty();

            var stateFipsInt = parseInt(stateFips);

            // get bounds of state
            var stateMap = topojson.feature(us, us.objects.states).features.filter(x => x.id === stateFipsInt);
            var statePath = d3.geoPath(d3.geoAlbersUsa().scale(1).translate([0, 0]));
            var b = statePath.bounds(stateMap[0]);
            var s = 0.95 / Math.max((b[1][0] - b[0][0]) / width, (b[1][1] - b[0][1]) / height);
            var t = [(width - s * (b[1][0] + b[0][0])) / 2, (height - s * (b[1][1] + b[0][1])) / 2];


            // get counties of state
            stateMap = topojson.feature(us, us.objects.counties).features.filter(x => padWithLeadingZeros(x.id, 5).substring(0, 2) === stateFips);

            var stateProjection = d3.geoAlbersUsa()
                .scale(s)
                .translate(t);

            var formatters = {
                'Population': { fmt: toShortNumber, desc: 'Population: ' },
                'Unemployed Rate': { fmt: (n) => toPercent(n, 100), desc: 'Unemployment Rate: ' },
                'CrimeRatePer100000': { fmt: (n) => toPercent(n, 100000), desc: 'Crime Rate Per 100,000: ' },
            };

            var fmt = { desc: '', fmt: toShortNumber };
            if (attribute in formatters) {
                fmt = formatters[attribute];
            }

            // build state choropleth
            legend = new Legend(800, 540, '', 20, 25, 10, fmt.fmt, false);
            var stateChoropleth = new Choropleth(
                stateProjection,
                stateMap,
                legend,
                (d) => fmt.desc + fmt.fmt(d.value));

            fipsToValue = data.filter((d) => d['StateCodeFIPS'] === stateFips).reduce((obj, row) => {
                var fips = row['FIPS'];
                var value = row[attribute];
                var name = row['Name'];

                return Object.assign(obj, { [fips]: { value: value, name: name } });
            }, {});

            stateChoropleth.data = fipsToValue;
            stateChoropleth.render(stateChoroplethSvg);
            stateChoropleth.select(fips);
        }
    };
});
