let met = function(str, obj) {
    let spl = str.split('.');
    let key = spl.shift();
    let res = Object.assign(obj);
    if(!res[key]) {
        return {}
    }
    while(res[key]) {
        res = res[key];
        if(!spl.length) {
            break;
        }
        key = spl.shift();
    }
    return res;
}

let met2 = function(str, map) {
    let spl = str.split('.');
    let data = {};
    let search = function(id, data={}) {
        let res = map.get(id);
        if(res) {
            if(!spl.length) {
                return res;
            }
            return search(id + '.' + spl.shift(), res);
        }
        return data;
    }
    if(spl.length) {
        data = search(spl.shift());
    }
    return data;
}
let map = new Map();
map.set('data', 'blabla');
map.set('data.name', 'emae');
map.set('data.name.first', 'gena');

console.log(met2('data.name', map));

/*let r=met('data.name.first', {data: {name: {first:'ara'}}});
console.log(r);*/