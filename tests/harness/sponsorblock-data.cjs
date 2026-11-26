/**
 * SponsorBlock's data for every script, unit or behaviour: the watched video
 * and a segment as the API returns it. Kept apart from sponsorblock.cjs,
 * which loads the page harness and jsdom, so a unit script that only needs
 * the data loads neither.
 *
 *   VIDEO, PREFIX                            the watched video's id and its sha256 prefix
 *   seg(category, start, end, actionType)   one segment ('skip' unless given)
 */
'use strict';

const crypto = require('crypto');

const VIDEO = 'dQw4w9WgXcQ';
const PREFIX = crypto.createHash('sha256').update(VIDEO).digest('hex').slice(0, 4);

const seg = (category, start, end, actionType) => ({
  category,
  actionType: actionType || 'skip',
  segment: [start, end],
  UUID: category + start,
  videoDuration: 300
});

module.exports = { VIDEO, PREFIX, seg };
