// Shorthand for $( document ).ready()
$(function () {
    var projection = d3.geoAlbersUsa();
    var usChoroplethSvg = d3.select("#usChoropleth")
        .append("svg")
        .attr("viewBox", `0 0 975 610`);

    var $selectedCounty = null;

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

    function selectCounty(path) {
        if ($selectedCounty) {
            $selectedCounty.remove();
        }

        // force rerender of element to put it on top
        var node = path.node();
        var clone = d3.select(node.cloneNode());
        clone.attr('stroke', 'black').attr('stroke-width', '2px');

        // append to end of counties so it renders on top and
        // we can see the thicker outlines
        var $clone = $(clone.node());
        $(node.parentNode).append($clone);
        $selectedCounty = $clone;
    }

    function dataLoaded(error, us, data) {
        var path = d3.geoPath(projection);
        var color = d3.scaleSequential();
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
            fipsToData[fips] = d;

            var name = d['RegionName'] + ', ' + d['State'];
            namesToFips[name] = fips;
        });

        var $menu = $('#county-dropdown .menu');
        Object.keys(namesToFips).sort().forEach(function (name) {
            var fips = namesToFips[name];
            var $item = $(`<div class="item" data-value="${fips}">${name}</div>`);
            $menu.append($item);
        });

        // enable dropdown
        $('.ui.dropdown').dropdown();

        $('#county-dropdown').dropdown('setting', 'onChange', function (fips) {
            var path = d3.select(`path[data-fips='${fips}']`);
            selectCounty(path);
        });

        // convert to numeric values
        data.forEach(function (d) {
            for (var field in d) {
                if (['RegionID', 'RegionName', 'State', 'Metro', 'StateCodeFIPS', 'MunicipalCodeFIPS'].includes(field)) {
                    continue;
                }

                d[field] = parseFloat(d[field]);
            }
        });

        var propertyValueRange = d3.extent(data, function (d) { return d[valueColumn]; })

        color.domain(propertyValueRange).
            interpolator(d3.interpolateBlues);

        var tooltip = d3.select("body").append("div")
            .attr("class", "tooltip")
            .style("opacity", 0);

        usChoroplethSvg.append("g")
            .attr("class", "county")
            .selectAll("path")
            .data(topojson.feature(us, us.objects.counties).features)
            .enter()
            .append("path")
            .attr("d", path)
            .attr('stroke', 'gray')
            .attr('stroke-width', '1')
            .attr('data-fips', function (d) {
                return padWithLeadingZeros(d.id, 5);
            })
            .attr("fill", function (d) {
                var fips = padWithLeadingZeros(d.id, 5);

                if (fips in fipsToData) {
                    var county = fipsToData[fips];
                    var x = color(parseInt(county[valueColumn]));
                    return x;
                }

                //console.log(fips);
                return color(0);
            })
            .on("mouseover", function (d) {
                tooltip.transition()
                    .duration(300)
                    .style("opacity", 1)

                var fips = padWithLeadingZeros(d.id, 5);
                var county = fipsToData[fips];
                if (!county) {
                    return;
                }

                tooltip.html('');
                tooltip.append('div').attr('class', 'name').text(county['RegionName']);
                tooltip.append('div').attr('class', 'data').text('Median Sale Price: ' + toCurrency(county[valueColumn]));

                tooltip.style("left", (d3.event.pageX + 30) + "px")
                    .style("top", (d3.event.pageY - 30) + "px");
            })
            .on("mouseout", function () {
                tooltip.transition()
                    .duration(300)
                    .style("opacity", 0);
            })
            .on("click", function () {
                var path = d3.select(this);
                var fips = path.attr('data-fips');

                // update dropdown to show selection
                $('#county-dropdown').dropdown('set selected', fips);
            });

        var legendBarWidth = 75;
        var legendBarHeight = 20;
        var interpolator = d3.interpolateNumber(propertyValueRange[0], propertyValueRange[1]);
        var legendData = [];

        for (var i = 0.0; i <= 1.0; i += 0.1) {
            legendData.push(Math.floor(interpolator(i)));
        }

        var legend = usChoroplethSvg.selectAll("g.legend")
            .data(legendData)
            .enter().append("g")
            .attr("class", "legend");

        legend.append("rect")
            .attr("x", function (d, i) { return (i * legendBarWidth); })
            .attr("y", 550)
            .attr("width", legendBarWidth)
            .attr("height", legendBarHeight)
            .style("fill", function (d, i) { return color(d); });

        legend.append("text")
            .attr("x", function (d, i) { return (i * legendBarWidth) + (legendBarWidth / 2); })
            .attr("y", 590)
            .attr('text-anchor', 'middle')
            .text(function (d) { return toShortCurrency(d); });

        var legendTitle = "January 2020 Median Property Values";

        usChoroplethSvg.append("text")
            .attr("x", 0)
            .attr("y", 540)
            .attr("class", "legend-title")
            .text(function () { return legendTitle });
    };
});
