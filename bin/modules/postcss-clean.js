var postcss = require('postcss');
var CleanCss = require('clean-css');

var initializer = function (opts) {
  if ( opts === void 0 ) opts = {};
  var cleancss = new CleanCss(opts);
  return function (css, res) {
    return new Promise(function (resolve, reject) {
      cleancss.minify(css.toString(), function (err, min) {

        if (err) {
          return reject(new Error(err.join('\n')))
        }

        for (var i = 0, list = min.warnings; i < list.length; i += 1) {
          var w = list[i];

          res.warn(w);
        }
        try {
          res.root = postcss.parse(min.styles);
        } catch(e) {
          console.log(e);
        }
        resolve();
      });
    })
  }
}

module.exports = postcss.plugin('clean', initializer);
