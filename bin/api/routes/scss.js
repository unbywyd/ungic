let path = require('path');
async function routes(fastify, options) {
    let app = fastify.app;
    fastify.get('/ungic/font-icons', async function(request, reply) {
         try {
            let app = fastify.app;
            if(!app.project.begined) {
                reply.code(400);
                throw new Error('Project not ready');
            }
            let iconsPlugin = app.project.plugins.get('icons');

            reply.code(200);
            reply.header("Content-Type", "text/css");
            if(!iconsPlugin.iconsStorage.fonts) {
                return '';
            }
            if(!iconsPlugin.iconsStorage.fonts.data || !iconsPlugin.iconsStorage.fonts.data.icons || !iconsPlugin.iconsStorage.fonts.data.icons.length) {
                return '';
            }
            return iconsPlugin.getFontsCSS();
        } catch(e) {
            return '';
        }
    });
    fastify.get('/ungic/sprites', async function(request, reply) {
        let app = fastify.app;
        if(!app.project.begined) {
            reply.code('400');
            throw new Error('Project not ready');
        }
        let iconsPlugin = app.project.plugins.get('icons');

        reply.code(200);
        reply.header("Content-Type", "text/css");
        if(!iconsPlugin.iconsStorage.sprite) {
            return '';
        }

        if(!iconsPlugin.iconsStorage.sprite.data.icons.length) {
            return '';
        }

        let config = iconsPlugin.config;
        return iconsPlugin.getSpritesCSS();
    });
}
module.exports = routes;