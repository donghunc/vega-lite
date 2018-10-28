import * as tslib_1 from "tslib";
import { isArray } from 'vega-util';
import { MAIN } from '../../data';
import { isAggregate } from '../../encoding';
import { getFieldDef, isFieldDef, isValueDef, vgField } from '../../fielddef';
import { AREA, isPathMark, LINE, TRAIL } from '../../mark';
import { isSortField } from '../../sort';
import { contains, getFirstDefined, keys } from '../../util';
import { getStyles, sortParams } from '../common';
import { area } from './area';
import { bar } from './bar';
import { geoshape } from './geoshape';
import { line, trail } from './line';
import { circle, point, square } from './point';
import { rect } from './rect';
import { rule } from './rule';
import { text } from './text';
import { tick } from './tick';
var markCompiler = {
    area: area,
    bar: bar,
    circle: circle,
    geoshape: geoshape,
    line: line,
    point: point,
    rect: rect,
    rule: rule,
    square: square,
    text: text,
    tick: tick,
    trail: trail
};
export function parseMarkGroup(model) {
    if (contains([LINE, AREA, TRAIL], model.mark)) {
        return parsePathMark(model);
    }
    else {
        return getMarkGroups(model);
    }
}
var FACETED_PATH_PREFIX = 'faceted_path_';
function parsePathMark(model) {
    var details = pathGroupingFields(model.mark, model.encoding);
    var pathMarks = getMarkGroups(model, {
        // If has subfacet for line/area group, need to use faceted data from below.
        fromPrefix: details.length > 0 ? FACETED_PATH_PREFIX : ''
    });
    if (details.length > 0) {
        // have level of details - need to facet line into subgroups
        // TODO: for non-stacked plot, map order to zindex. (Maybe rename order for layer to zindex?)
        return [
            {
                name: model.getName('pathgroup'),
                type: 'group',
                from: {
                    facet: {
                        name: FACETED_PATH_PREFIX + model.requestDataName(MAIN),
                        data: model.requestDataName(MAIN),
                        groupby: details
                    }
                },
                encode: {
                    update: {
                        width: { field: { group: 'width' } },
                        height: { field: { group: 'height' } }
                    }
                },
                marks: pathMarks
            }
        ];
    }
    else {
        return pathMarks;
    }
}
export function getSort(model) {
    var encoding = model.encoding, stack = model.stack, mark = model.mark, markDef = model.markDef;
    var order = encoding.order;
    if (!isArray(order) && isValueDef(order)) {
        return undefined;
    }
    else if ((isArray(order) || isFieldDef(order)) && !stack) {
        // Sort by the order field if it is specified and the field is not stacked. (For stacked field, order specify stack order.)
        return sortParams(order, { expr: 'datum' });
    }
    else if (isPathMark(mark)) {
        // For both line and area, we sort values based on dimension by default
        var dimensionChannelDef = encoding[markDef.orient === 'horizontal' ? 'y' : 'x'];
        if (isFieldDef(dimensionChannelDef)) {
            var s = dimensionChannelDef.sort;
            var sortField = isSortField(s)
                ? vgField({
                    // FIXME: this op might not already exist?
                    // FIXME: what if dimensionChannel (x or y) contains custom domain?
                    aggregate: isAggregate(model.encoding) ? s.op : undefined,
                    field: s.field
                }, { expr: 'datum' })
                : vgField(dimensionChannelDef, {
                    // For stack with imputation, we only have bin_mid
                    binSuffix: model.stack && model.stack.impute ? 'mid' : undefined,
                    expr: 'datum'
                });
            return {
                field: sortField,
                order: 'descending'
            };
        }
        return undefined;
    }
    return undefined;
}
function getMarkGroups(model, opt) {
    if (opt === void 0) { opt = { fromPrefix: '' }; }
    var mark = model.mark;
    var clip = getFirstDefined(model.markDef.clip, scaleClip(model));
    var style = getStyles(model.markDef);
    var key = model.encoding.key;
    var sort = getSort(model);
    var postEncodingTransform = markCompiler[mark].postEncodingTransform
        ? markCompiler[mark].postEncodingTransform(model)
        : null;
    return [
        tslib_1.__assign({ name: model.getName('marks'), type: markCompiler[mark].vgMark }, (clip ? { clip: true } : {}), (style ? { style: style } : {}), (key ? { key: { field: key.field } } : {}), (sort ? { sort: sort } : {}), { from: { data: opt.fromPrefix + model.requestDataName(MAIN) }, encode: {
                update: markCompiler[mark].encodeEntry(model)
            } }, (postEncodingTransform
            ? {
                transform: postEncodingTransform
            }
            : {}))
    ];
}
/**
 * Returns list of path grouping fields
 * that the model's spec contains.
 */
export function pathGroupingFields(mark, encoding) {
    return keys(encoding).reduce(function (details, channel) {
        switch (channel) {
            // x, y, x2, y2, lat, long, lat1, long2, order, tooltip, href, cursor should not cause lines to group
            case 'x':
            case 'y':
            case 'order':
            case 'href':
            case 'x2':
            case 'y2':
            case 'latitude':
            case 'longitude':
            case 'latitude2':
            case 'longitude2':
            // TODO: case 'cursor':
            // text, shape, shouldn't be a part of line/trail/area
            case 'text':
            case 'shape':
            // tooltip fields should not be added to group by
            case 'tooltip':
                return details;
            case 'detail':
            case 'key':
                var channelDef = encoding[channel];
                if (isArray(channelDef) || isFieldDef(channelDef)) {
                    (isArray(channelDef) ? channelDef : [channelDef]).forEach(function (fieldDef) {
                        if (!fieldDef.aggregate) {
                            details.push(vgField(fieldDef, {}));
                        }
                    });
                }
                return details;
            case 'size':
                if (mark === 'trail') {
                    // For trail, size should not group trail lines.
                    return details;
                }
            // For line, it should group lines.
            /* tslint:disable */
            // intentional fall through
            case 'color':
            case 'fill':
            case 'stroke':
            case 'opacity':
                // TODO strokeDashOffset:
                /* tslint:enable */
                var fieldDef = getFieldDef(encoding[channel]);
                if (fieldDef && !fieldDef.aggregate) {
                    details.push(vgField(fieldDef, {}));
                }
                return details;
            default:
                throw new Error("Bug: Channel " + channel + " unimplemented for line mark");
        }
    }, []);
}
/**
 * If scales are bound to interval selections, we want to automatically clip
 * marks to account for panning/zooming interactions. We identify bound scales
 * by the domainRaw property, which gets added during scale parsing.
 */
function scaleClip(model) {
    var xScale = model.getScaleComponent('x');
    var yScale = model.getScaleComponent('y');
    return (xScale && xScale.get('domainRaw')) || (yScale && yScale.get('domainRaw')) ? true : false;
}
//# sourceMappingURL=mark.js.map