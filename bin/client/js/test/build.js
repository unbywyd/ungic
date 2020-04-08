let path = require('path');
let chokidar = require('chokidar');
const babel = require("@babel/core");
const fs = require("fs");
const browserify = require('browserify');
const babelify = require("babelify");
let render = (name) => {
    let src = path.join(__dirname, 'source', name + '.js');
    return new Promise((res, rej) => {

        let output = fs.createWriteStream(path.join(__dirname, 'dist', name + '.min.js'));
        output.on('finish', function () {
            console.log('finish');
            res();
        });
        let b = browserify(src)
            .transform(babelify.configure({
                compact: true,
                presets: ["@babel/preset-env", {
                    "sourceType": 'module'
                }]
            }))
            .transform('uglifyify', {global:true})
            .bundle()
            .pipe(output);
    });
}
(async()=> {
    if(process.argv[2] != undefined) {
        let proj = process.argv[2];
        await render(proj);
        chokidar.watch(path.join(__dirname, 'source'), {
            ignoreInitial: true
        }).on('all', (event, path) => {
            render(proj);
        });
    }
})();