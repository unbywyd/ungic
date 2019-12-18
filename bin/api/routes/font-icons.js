let path = require('path');
async function routes(fastify, options) {
    let app = fastify.app;
    fastify.get('/ungic/font-icons', async function(request, reply) {
        let app = fastify.app;
        if(!app.project.begined) {
            reply.code('400');
            throw new Error('Project not ready');
        }
        let iconsPlugin = app.project.plugins.get('icons');

        if(!iconsPlugin.iconsStorage.fonts) {
            reply.code('400');
            throw new Error(`Icons plugin did not generate icon fonts`);
        }
        if(!iconsPlugin.iconsStorage.fonts.data.icons.length) {
            reply.code('400');
            throw new Error('No generated font icons');
        }
        reply.header("Content-Type", "text/css");

        return iconsPlugin.getCSS(fastify.address + '/' + path.relative(app.project.dist, iconsPlugin.fontsDist).replace(/\\+/g, '/') + '/');
    });
}
module.exports = routes;