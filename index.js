var coroutine = require('coroutine');
var util = require('util');

module.exports = (opt, maxsize, timeout) => {
    if (util.isFunction(opt)) {
        opt = {
            create: opt,
            maxsize: maxsize,
            timeout: timeout
        };
    }

    var create = opt.create;
    var destroy = opt.destroy || ((o) => {
        if (o.close)
            o.close();
        if (o.destroy)
            o.destroy();
        if (o.dispose)
            o.dispose();
    });

    maxsize = opt.maxsize || 10;
    timeout = opt.timeout || 60000;
    var tm = timeout / 10;
    if (tm < 10)
        tm = 10;

    var pools = [];
    var count = 0;

    var sem = new coroutine.Semaphore(maxsize);
    var clearTimer;

    function clearPool() {
        var c;
        var d = new Date().getTime();

        while (count) {
            c = pools[0];

            if (d - c.time.getTime() > timeout) {
                pools = pools.slice(1);
                count--;

                coroutine.start(destroy, c.o);
            } else
                break;
        }

        if (!clearTimer)
            clearTimer = setInterval(clearPool, tm);
        else if (!count) {
            clearTimer.clear();
            clearTimer = null;
        }
    }

    var pool = (func) => {
        var r;
        var o;

        clearPool();
        sem.acquire();

        try {
            o = count ? pools[--count].o : create();
            r = func(o);
            pools[count++] = {
                o: o,
                time: new Date()
            };
        } catch (e) {
            coroutine.start(destroy, o);
            throw e;
        } finally {
            sem.post();
            clearPool();
        }

        return r;
    }

    pool.connections = () => {
        return count;
    }

    pool.info = () => {
        return {
            maxsize: maxsize,
            pools: pools.length,
            count: count,
            wait: sem.count(),
            timeout: timeout
        }
    }

    return pool;
}
