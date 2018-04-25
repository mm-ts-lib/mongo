"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongo_1 = require("../src/mongo");
/**
 * 导出索引信息
 */
exports.default = new mongo_1.DbSchema({}, {
    name: {
        fields: {
            name: 1
        },
        options: {
            unique: true,
            sparse: false,
            dropDups: true
        }
    }
});
//# sourceMappingURL=test.js.map