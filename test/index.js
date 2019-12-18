let sass = require('sass');

sass.render({
    data: '@use "gena";',
    importer: function(prev, url, done) {
        done();
    },
    functions: {
        'test($name)': function($test) {

            console.log(this.global);
        }
    }
}, function(res) {

});