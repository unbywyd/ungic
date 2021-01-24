module.exports.urlJoin = (url='', suffix='') => {
    return url.replace(/\/+$/, '') + '/' + suffix.replace(/^\/+/, '');
}
