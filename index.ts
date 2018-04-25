import { Mongo } from './mongo';
import { Collection } from 'mongodb';
import { DbSchema } from './mongo';

import collections from './_collections';

export const mongo = new Mongo(collections);

export default mongo.collections();


