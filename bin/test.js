
let fastify = require('fastify');
let Fastify = fastify({ logger: false, ignoreTrailingSlash: false});
(async()=>{
  await Fastify.listen(2300);
  let readline = require('readline');
  let data = {
    input: process.stdin,
    output: process.stdout,
    prompt: 'blalba: '
  }
  let rn = readline.createInterface(data);
  rn.on('line', () => {
    rn.close();
  });
  rn.prompt();
})();



/*rn.on('close', () => {
  data.prompt = "dsf";  
  rn = readline.createInterface(data);
  rn.prompt();
}).close();*/