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
        reply.header("Content-Type", "text/css");
        if(!iconsPlugin.iconsStorage.fonts.data.icons.length) {
            reply.code(200);
            return '';
        }
        return iconsPlugin.getFontsCSS();
    });
    fastify.get('/ungic/sprites', async function(request, reply) {
        let app = fastify.app;
        if(!app.project.begined) {
            reply.code('400');
            throw new Error('Project not ready');
        }
        let iconsPlugin = app.project.plugins.get('icons');

        if(!iconsPlugin.iconsStorage.sprite) {
            reply.code('400');
            throw new Error(`Icons plugin did not generate sprites`);
        }
        reply.header("Content-Type", "text/css");

        if(!iconsPlugin.iconsStorage.sprite.data.icons.length) {
            reply.code(200);
            return '';
        }

        let config = iconsPlugin.config;

        // config.fs.dist.css
        return iconsPlugin.getSpritesCSS();
    });
}
module.exports = routes;