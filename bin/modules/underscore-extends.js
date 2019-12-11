const _ = require('underscore');
module.exports = function(target, methods, key) {
    for(let method of methods) {
        if(method in _ && !(method in target)) {
            target.prototype[method] = function(...arguments) {
                return _[method](this[key], ...arguments);
            }
        }
    }
}