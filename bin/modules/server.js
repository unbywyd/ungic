const handler = require('serve-handler');
const fastify = require('fastify');
const _ = require('underscore');

const app = function(public, port=3030) {
    this.port = port;
    this.options = {
        server: {
            public,
            renderSingle: true,                     
            symlinks: true,
            headers: [{
                "source" : "**/*",
                "headers" : [
                    {
                        "key" : "Cache-Control",
                        "value" : "no-store, no-cache, must-revalidate, proxy-revalidate"
                    },
                    {
                        "key" : "Access-Control-Allow-Origin",
                        "value": "*"
                    },
                    {
                        "key" : "Surrogate-Control",
                        "value" : "no-store",
                    },
                    {
                        "key" : "Pragma",
                        "value" : "no-cache"
                    },
                    {
                        "key" : "Expires",
                        "value" : "0"
                    }
                ]
            }]
        }
    }
}
app.prototype.listen = async function() {   
    this.server = fastify({ logger: false, ignoreTrailingSlash: false});
    this.server.use((req, res) => {
        handler(req, res, this.options.server || {});
    });
    return new Promise(done => {
        let start = async () => {
            await this.server.listen(this.port).then(address => {
                this.server.address = address;
                done(address);
            }).catch(() => {
                this.server.close();
                this.port = this.port + 1;
                start();
            });
        }
        start();
    });
}
app.prototype.kill = function() {
    return this.server.close();
}
module.exports.app = app;

let servers = function() {
    this.servers = {}
}
servers.prototype.create = function(public, port) {
    if(this.servers[public]) {
        return Promise.reject(new Error(`${public} server already exists`));
    }
    let server = new app(public, port);    
    this.servers[public] = server;
    return server.listen();
}
servers.prototype.kill = function(public) {
    if(this.servers[public]) {
        this.servers[public].kill();
        delete this.servers[public];
        return Promise.resolve();
    } else {
        return Promise.reject(new Error(`${public} server was not launched`));
    }
}
module.exports = servers;