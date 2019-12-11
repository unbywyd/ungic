async function routes(fastify, options) {
    fastify.get('/scss/create', async function(request, reply) {
        return {
            hello:'Artem'
        }
    });
}
module.exports = routes;