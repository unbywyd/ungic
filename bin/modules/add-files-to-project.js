const { errorMonitor } = require('svgicons2svgfont');
const Collector = require('./collector.js');
module.exports = function(action) {
  return new Promise(async(done, rej) => {
    let scssPlugin = this.app.project.plugins.get('scss');
    let htmlPlugin = this.app.project.plugins.get('html');
    let iconsPlugin = this.app.project.plugins.get('icons');
    scssPlugin.renderMaster.pause();
    htmlPlugin.renderMaster.pause();
    iconsPlugin.renderMaster.pause();

    // Максимальный перерыв между ответами от плагинов
    let collector = new Collector({
      timeout: 1000
    });   

    // Запустили запасной таймер
    let spareMethod = setTimeout(() => {
      collector.add({});
    }, 1000);

    function toCollect(events) {
      // После того, как хоть один плагин ответит отменим запасной таймер
      clearTimeout(spareMethod);
      collector.add(events);
    }    
    scssPlugin.renderMaster.collector.on('finish', toCollect);
    htmlPlugin.renderMaster.collector.on('finish', toCollect);
    iconsPlugin.renderMaster.collector.on('finish', toCollect);
   
    let proms = [];
    proms.push(new Promise((res, rej) => {
      function toFinish() {
        collector.off('finish', toFinish);
        scssPlugin.renderMaster.collector.off('finish', toCollect);
        htmlPlugin.renderMaster.collector.off('finish', toCollect);
        iconsPlugin.renderMaster.collector.off('finish', toCollect);
        setTimeout(async() => {
          scssPlugin.renderMaster.pause(false);
          htmlPlugin.renderMaster.pause(false);
          iconsPlugin.renderMaster.pause(false);
          try {
            await iconsPlugin.renderMaster.run();
            await scssPlugin.renderMaster.run();
            await htmlPlugin.renderMaster.run();
            res();
          } catch(e) {
            rej(e);
          }
        }, 200);
      }
      collector.on('finish', toFinish);
    }));
    
    proms.push(new Promise((res, rej) => {
      action().then(res).catch(rej);
    }));  

    Promise.all(proms).then(done).catch(rej);
  });
}