let fs = require('fs');
const fg = require('fast-glob');
module.exports = async function(fastify) {
    let files = await fg('./routes/*.js', {cwd: __dirname});
    if(files.length) {
        for(let file of files) {
            fastify.register(require(file));
        }
    }
}