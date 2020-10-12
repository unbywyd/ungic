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

        reply.code(200);
        reply.header("Content-Type", "text/css");
        if(!iconsPlugin.iconsStorage.fonts) {
            //reply.code('400');
            //throw new Error(`Icons plugin did not generate icon fonts`);
            return '';
        }

        if(!iconsPlugin.iconsStorage.fonts.data.icons.length) {
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

        reply.code(200);
        reply.header("Content-Type", "text/css");
        if(!iconsPlugin.iconsStorage.sprite) {
            //reply.code('400');
            //throw new Error(`Icons plugin did not generate sprites`);
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