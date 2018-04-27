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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3Rlc3QvdGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLHdDQUF3QztBQUV4Qzs7R0FFRztBQUNILGtCQUFlLElBQUksZ0JBQVEsQ0FJekIsRUFBRSxFQUNGO0lBQ0UsSUFBSSxFQUFFO1FBQ0osTUFBTSxFQUFFO1lBQ04sSUFBSSxFQUFFLENBQUM7U0FDUjtRQUNELE9BQU8sRUFBRTtZQUNQLE1BQU0sRUFBRSxJQUFJO1lBQ1osTUFBTSxFQUFFLEtBQUs7WUFDYixRQUFRLEVBQUUsSUFBSTtTQUNmO0tBQ0Y7Q0FDRixDQUNGLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBEYlNjaGVtYSB9IGZyb20gJy4uL3NyYy9tb25nbyc7XG5cbi8qKlxuICog5a+85Ye657Si5byV5L+h5oGvXG4gKi9cbmV4cG9ydCBkZWZhdWx0IG5ldyBEYlNjaGVtYTx7XG4gIG5hbWU6IHN0cmluZztcbiAgdWlkOiBudW1iZXI7XG59PihcbiAge30sXG4gIHtcbiAgICBuYW1lOiB7XG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgbmFtZTogMVxuICAgICAgfSxcbiAgICAgIG9wdGlvbnM6IHtcbiAgICAgICAgdW5pcXVlOiB0cnVlLFxuICAgICAgICBzcGFyc2U6IGZhbHNlLFxuICAgICAgICBkcm9wRHVwczogdHJ1ZVxuICAgICAgfVxuICAgIH1cbiAgfVxuKTtcbiJdfQ==