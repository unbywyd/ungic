const _ = require('underscore');
class Storage {
    constructor() {
        this.storage = [];
    }
    set(data) {
        let prev = this.get(data);
        if(prev) {
            this.storage = _.without(this.storage, prev);
        }
        this.storage.push(data);
    }
    get(data) {
        if(!data) {
            return this.storage;
        }
        return _.findWhere(this.storage, data);
    }
    clean(rej) {
        let rejected = [];
        this.storage = _.reject(this.storage, m => {
            if(rej(m)) {
                rejected.push(m);
                return true;
            }
        });
        return rejected;
    }
}
module.exports = Storage;