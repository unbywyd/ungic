module.exports = function(url) {
    if(typeof url == 'string') {
        url = url.trim().toLowerCase();
        return !(/^(\w{3,}:\/\/)|\/\//gm.test(url));
    }
    return false
}