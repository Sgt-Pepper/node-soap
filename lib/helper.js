

function splitNSName(nsName) {
    var i = (nsName != null) ? nsName.indexOf(':') : -1;
    return i < 0 ? {namespace:null,name:nsName} : {namespace:nsName.substring(0, i), name:nsName.substring(i+1)};
}

function xmlEscape(obj) {
    if (typeof(obj) === 'string') {
        return obj
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;')        
    }

    return obj;
}

var trimLeft = /^[\s\xA0]+/;
var trimRight = /[\s\xA0]+$/;

function trim(text) {
    return text.replace(trimLeft, '').replace(trimRight, '');
}

function extend(base, obj) {
    for (var key in obj) {
        if (obj.hasOwnProperty(key)) {
            base[key] = obj[key];
        }
    }
    return base;
}

function findKey(obj, val) {
    for (var n in obj) if (obj[n] === val) return n;
}

exports.splitNSName = splitNSName;
exports.xmlEscape = xmlEscape;
exports.trimLeft = trimLeft;
exports.trimRight = trimRight;
exports.trim = trim;
exports.extend = extend;
exports.findKey = findKey;