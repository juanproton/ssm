class Random {
    constructor(o) {
        (this.tokenData = o), (this.useA = !1);
        let e = function (o) {
            let e = parseInt(o.substr(0, 8), 16),
                n = parseInt(o.substr(8, 8), 16),
                r = parseInt(o.substr(16, 8), 16),
                a = parseInt(o.substr(24, 8), 16);
            return function () {
                let o = ((((e |= 0) + (n |= 0)) | 0) + (a |= 0)) | 0;
                return (a = (a + 1) | 0), (e = n ^ (n >>> 9)), (n = ((r |= 0) + (r << 3)) | 0), (r = ((r = (r << 21) | (r >>> 11)) + o) | 0), (o >>> 0) / 4294967296;
            };
        };
        (this.prngA = new e(this.tokenData.hash.substr(2, 32))), (this.prngB = new e(this.tokenData.hash.substr(34, 32)));
        for (let o = 0; o < 1e6; o += 2) this.prngA(), this.prngB();
    }
    random_dec() {
        return (this.useA = !this.useA), this.useA ? this.prngA() : this.prngB();
    }
    random_num(o, e) {
        return o + (e - o) * this.random_dec();
    }
    random_int(o, e) {
        return Math.floor(this.random_num(o, e));
    }
    random_int2(o, e) {
        return Math.floor(this.random_num(o, e + 1));
    }
    random_choice(o) {
        return o[this.random_int2(0, o.length - 1)];
    }
}
