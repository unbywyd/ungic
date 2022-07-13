let path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const fse = require('fs-extra');
const _ = require('underscore');
const { promisify } = require("util");
fsp.exists = promisify(fs.exists);
async function routes(fastify, options) {
    let app = fastify.app;
    fastify.get('/ungic/pipe', {
        schema: {
            query: {
                type: 'object',
                properties: {
                    dir: {
                        type: 'string'
                    },
                    timeout: {
                        type: 'number'
                    },
                    cids: {
                        type:'string'
                    },
                    as: {
                        type: 'string'
                    },
                    silence: {
                        type: 'boolean'                        
                    }
                }
            }
        }
    }, async function(request, reply) {
        let app = fastify.app;
        if(!app.project.begined) {
            reply.code('400');
            throw new Error('Project not ready');
        }
        let cids = request.query.cids ? request.query.cids.split(',') : [];
        let silence = request.query.silence;

        let scssPlugin = app.project.plugins.get('scss');

        let allScssComponents = await scssPlugin.getComponents();

        let components = [];
        if(cids.length) {
            for(let cid of cids) {
                if(allScssComponents.includes(cid)) {
                    components.push(cid);
                }
            }
        }
        reply.header("Content-Type", "application/javascript");

        let pages = request.query.as ? request.query.as.split(',') : [];
        if(pages.length) {
            pages = _.map(pages, p => {
                if(path.extname(p) == '') {
                    return p + '.html';
                } else {
                    return p;
                }
            });
        }
        reply.code(200);
        let dir = ("dir" in request.query && ['ltr', 'rtl'].indexOf(request.query.dir) != -1) ? request.query.dir : '';

        let htmlPlugin = app.project.plugins.get('html');
        let config = htmlPlugin.config;

        var pathToModule = require.resolve('socket.io-client');
        const ioSockets = await fsp.readFile(path.join(path.dirname(path.dirname(pathToModule)), 'dist/socket.io.js'), 'UTF-8');

        let output = `
        let DOMContentLoaded = (callback) => {
            if (document.readyState === "complete" || document.readyState === "interactive") {
                callback();
            } else {
                window.addEventListener("DOMContentLoaded", callback);
            }
        }
        
        (function(){${ioSockets} \n DOMContentLoaded(function() {`;
        if(components.length) {
            for(let cid of components) {
                let pathToCSS = path.join(htmlPlugin.dist, config.fs.dist.css, cid + (['ltr', 'rtl'].indexOf(dir) == -1 ? '' : '.' + dir) + '.css');
                let href = '/' + path.relative(htmlPlugin.dist, pathToCSS).replace(/\\+/g, '/');
                href = fastify.address + href.replace(/\\+/g, '/');
                output += `
                    var link = document.createElement('link');
                    link.setAttribute('rel', 'stylesheet');
                    link.setAttribute('data-component', "${cid}");
                    link.href = "${href}?v=${Date.now()}";
                    document.querySelector('head').appendChild(link);
                `;
            }
        }
        output += `
            let silence = ${silence};
            const Timeout = ${request.query.timeout || 0};
            let t;
            function reload(relative) {
                document.dispatchEvent(new CustomEvent('ungic_reload', {detail:relative}));                
                if(silence) {
                    return
                }
                var doc = document.documentElement;
                var x = (window.pageXOffset || doc.scrollLeft) - (doc.clientLeft || 0);
                var y = (window.pageYOffset || doc.scrollTop)  - (doc.clientTop || 0);
                window.localStorage.setItem('wp-last-scroll-position', x + ',' + y);
                clearTimeout(t);
                t = setTimeout(() => {
                    window.location.reload();
                }, Timeout);                  
            }
            const socket = io("${fastify.address}");
            const pages = "${pages}";            
            const resource = window.performance ? window.performance.getEntriesByType("resource") : [];
            socket.on('change', (events) => {
                for(let e of events) {       
                    console.log(e);             
                    document.dispatchEvent(new CustomEvent('ungic', {detail:e}));
                    let {events, relative, url}  = e;
                    if(pages.indexOf(relative) != -1 || pages.indexOf('*') != -1) {                        
                        return reload(relative);                        
                    }
                    let skips = [];
                    if(e.relative.indexOf('.css') != -1) {
                        let links = document.querySelectorAll('[href*="'+relative+'"]');
                        if(links.length) {
                            for(let link of links) {
                                link.setAttribute('href', url + '?v=' + Date.now());
                                skips.push(link);
                            }
                        }
                    }
                    for(let res of resource) {
                        if(res.name.indexOf(url) != -1) {
                            if(res.initiatorType == 'link') {
                                let links = document.querySelectorAll('[href*="'+relative+'"]');
                                if(links.length) {
                                    for(let link of links) {
                                        if(skips.indexOf(link) == -1) {
                                            link.setAttribute('href', url + '?v=' + Date.now());
                                        }
                                    }
                                }
                            } else {
                               reload(relative);
                            }
                        }
                    }
                }
            });
        })})();`;

        return output;
    });
}
module.exports = routes;