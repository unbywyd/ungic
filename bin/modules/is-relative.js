module.exports = function(url) {
    if(typeof url == 'string') {
        url = url.trim().toLowerCase();
        return !/^(\w{2,})?:\/\//.test(url) && !/^#/.test(url);
    }
    return false
}
