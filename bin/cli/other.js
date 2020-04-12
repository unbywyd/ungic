const path = require('path');
const inquirer = require('inquirer');
const fg = require('fast-glob');
const fse = require('fs-extra');
const _ = require('underscore');
const prompts = require('../modules/prompt.js');
module.exports = function(yargs, done) {
   yargs
    .command('demo', 'Install demo content', args => {
    }, args => {
        let app = this.app;
        let demoPath = path.join(__dirname, '../demo');
        let scssPlugin = this.app.project.plugins.get('scss');
        let htmlPlugin = this.app.project.plugins.get('html');
        let iconsPlugin = this.app.project.plugins.get('icons');

        /*scssPlugin.unwatch();
        htmlPlugin.unwatch();
        iconsPlugin.unwatch();*/

        (async()=>{
            try {
                let created = await scssPlugin.createComponent('icons');
            } catch(e) {
                done(e);
                return
            }
            await fse.copy(demoPath, path.join(app.project.root, app.project.fsDirs('source')), {
                overwrite:true
            });
            done('Done!');
        })();

        /*
        *   1. Остановить ватчер для всего проекта (Для всех трех плагинов)
        *   2. Выполнить действия по созданию физических файлов
        *   3. Перезапустить рендеринг теъ частей что были затронуты / Полный рестарт
        ---------------------------
            1. Подписаться на все 3 реади евента к плагинам и по окончанию запустить ребилд html страницы
        ---------------------------
           - Все файлы которые запрашивали иконки и не получили дату сохранить как Требующие эти данные и после того как данные поступают отправить их на ререндер
           (Можно приписать к любым данным которые не были получены)
        */
    })
    .argv;
}