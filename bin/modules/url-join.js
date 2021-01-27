module.exports.urlJoin = (url='', suffix='') => {
    suffix = suffix.replace(/\\+/g, '/');
    let result = url.replace(/\/+$/, '') + '/' + suffix.replace(/^\/+/, '');
    return result.replace(/\\+/g, '/');
}
