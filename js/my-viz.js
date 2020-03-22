// Shorthand for $( document ).ready()
$(function () {
    var projection = d3.geoAlbersUsa();
    var usChoroplethSvg = d3.select("#usChoropleth")
        .append("svg")
        .attr("viewBox", `0 0 900 600`);

    var selectedCounty = null;

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

    function selectCounty(element) {
        if (selectedCounty) {
            selectedCounty.attr('stroke', 'gray').attr('stroke-width', '1');
        }

        element.attr('stroke', 'black').attr('stroke-width', '1.5');
        selectedCounty = element;
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
            var $elt = $(`path[data-fips='${fips}']`);
            selectCounty($elt);
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

                console.log(fips);
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
                selectCounty(d3.select(this));
            });
    };
});