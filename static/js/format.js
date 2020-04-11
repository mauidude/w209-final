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
