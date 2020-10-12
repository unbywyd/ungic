const Collector = require('./collector.js');
module.exports = function(action) {
  return new Promise(async(done, rej) => {
    let scssPlugin = this.app.project.plugins.get('scss');
    let htmlPlugin = this.app.project.plugins.get('html');
    let iconsPlugin = this.app.project.plugins.get('icons');
    scssPlugin.renderMaster.pause();
    htmlPlugin.renderMaster.pause();
    iconsPlugin.renderMaster.pause();
    let collector = new Collector({
      timeout: 1000
    });
    try {
      await action();
    } catch(e) {
      return rej(e);
    }
    let spareMethod = setTimeout(() => {
      collector.add({});
    }, 1000);
    function toCollect(events) {
      clearTimeout(spareMethod);
      collector.add(events);
    }
    scssPlugin.renderMaster.collector.on('finish', toCollect);
    htmlPlugin.renderMaster.collector.on('finish', toCollect);
    iconsPlugin.renderMaster.collector.on('finish', toCollect);
    let self = this;
    function toFinish() {
      collector.off('finish', toFinish);
      scssPlugin.renderMaster.collector.off('finish', toCollect);
      htmlPlugin.renderMaster.collector.off('finish', toCollect);
      iconsPlugin.renderMaster.collector.off('finish', toCollect);
      setTimeout(async() => {
        scssPlugin.renderMaster.pause(false);
        htmlPlugin.renderMaster.pause(false);
        iconsPlugin.renderMaster.pause(false);
        await iconsPlugin.renderMaster.run();
        await scssPlugin.renderMaster.run();
        await htmlPlugin.renderMaster.run();
        done();
      }, 200);
    }
    collector.on('finish', toFinish);
  });
}