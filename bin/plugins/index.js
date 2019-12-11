const skeleton = require('../modules/skeleton');
const path = require('path');
const fg = require('fast-glob');
class ungicPlugin extends skeleton {
    constructor(privateScheme={}, modelConfig={}, sysconfig={}) {
        let commonScheme = require('./model-scheme');

        super(Object.assign({}, commonScheme, privateScheme), {objectMerge: true}, modelConfig);
        let config = this.config;
        this.project = sysconfig.project;
        this.id = config.id;
        this.root = path.join(this.project.root, config.fs.dirs.source, config.fs.source[this.id]);
        this.dist = path.join(this.project.root, config.fs.dirs.dist);
    }
    watch() {
        fg('**/*', {cwd: this.root}).then(() => {
            this.project.watcher.add(path.join(this.root, '**/*'));
        });
    }
    log(message, type="log", args={}) {
        if(message instanceof Error) {
            type = 'error';
            message = message.message;
        }
        args.plugin_id = this.id;
        this._events.emit('log', type, message, args);
    }
    error(message, args={}) {
        args.plugin_id = this.id;
        this.log(message, 'error', args);
    }
    warning(message, args={}) {
        args.plugin_id = this.id;
        this.log(message, 'warning', args);
    }
    unwatch() {
        this.project.watcher.unwatch(path.join(this.root, '**/*'));
    }
}


module.exports = ungicPlugin;