import { createRequire as __WEBPACK_EXTERNAL_createRequire } from "module";
/******/ var __webpack_modules__ = ({

/***/ 379:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const ANY = Symbol('SemVer ANY')
// hoisted class for cyclic dependency
class Comparator {
  static get ANY () {
    return ANY
  }

  constructor (comp, options) {
    options = parseOptions(options)

    if (comp instanceof Comparator) {
      if (comp.loose === !!options.loose) {
        return comp
      } else {
        comp = comp.value
      }
    }

    comp = comp.trim().split(/\s+/).join(' ')
    debug('comparator', comp, options)
    this.options = options
    this.loose = !!options.loose
    this.parse(comp)

    if (this.semver === ANY) {
      this.value = ''
    } else {
      this.value = this.operator + this.semver.version
    }

    debug('comp', this)
  }

  parse (comp) {
    const r = this.options.loose ? re[t.COMPARATORLOOSE] : re[t.COMPARATOR]
    const m = comp.match(r)

    if (!m) {
      throw new TypeError(`Invalid comparator: ${comp}`)
    }

    this.operator = m[1] !== undefined ? m[1] : ''
    if (this.operator === '=') {
      this.operator = ''
    }

    // if it literally is just '>' or '' then allow anything.
    if (!m[2]) {
      this.semver = ANY
    } else {
      this.semver = new SemVer(m[2], this.options.loose)
    }
  }

  toString () {
    return this.value
  }

  test (version) {
    debug('Comparator.test', version, this.options.loose)

    if (this.semver === ANY || version === ANY) {
      return true
    }

    if (typeof version === 'string') {
      try {
        version = new SemVer(version, this.options)
      } catch (er) {
        return false
      }
    }

    return cmp(version, this.operator, this.semver, this.options)
  }

  intersects (comp, options) {
    if (!(comp instanceof Comparator)) {
      throw new TypeError('a Comparator is required')
    }

    if (this.operator === '') {
      if (this.value === '') {
        return true
      }
      return new Range(comp.value, options).test(this.value)
    } else if (comp.operator === '') {
      if (comp.value === '') {
        return true
      }
      return new Range(this.value, options).test(comp.semver)
    }

    options = parseOptions(options)

    // Special cases where nothing can possibly be lower
    if (options.includePrerelease &&
      (this.value === '<0.0.0-0' || comp.value === '<0.0.0-0')) {
      return false
    }
    if (!options.includePrerelease &&
      (this.value.startsWith('<0.0.0') || comp.value.startsWith('<0.0.0'))) {
      return false
    }

    // Same direction increasing (> or >=)
    if (this.operator.startsWith('>') && comp.operator.startsWith('>')) {
      return true
    }
    // Same direction decreasing (< or <=)
    if (this.operator.startsWith('<') && comp.operator.startsWith('<')) {
      return true
    }
    // same SemVer and both sides are inclusive (<= or >=)
    if (
      (this.semver.version === comp.semver.version) &&
      this.operator.includes('=') && comp.operator.includes('=')) {
      return true
    }
    // opposite directions less than
    if (cmp(this.semver, '<', comp.semver, options) &&
      this.operator.startsWith('>') && comp.operator.startsWith('<')) {
      return true
    }
    // opposite directions greater than
    if (cmp(this.semver, '>', comp.semver, options) &&
      this.operator.startsWith('<') && comp.operator.startsWith('>')) {
      return true
    }
    return false
  }
}

module.exports = Comparator

const parseOptions = __nccwpck_require__(356)
const { safeRe: re, t } = __nccwpck_require__(471)
const cmp = __nccwpck_require__(646)
const debug = __nccwpck_require__(159)
const SemVer = __nccwpck_require__(163)
const Range = __nccwpck_require__(782)


/***/ }),

/***/ 782:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const SPACE_CHARACTERS = /\s+/g

// hoisted class for cyclic dependency
class Range {
  constructor (range, options) {
    options = parseOptions(options)

    if (range instanceof Range) {
      if (
        range.loose === !!options.loose &&
        range.includePrerelease === !!options.includePrerelease
      ) {
        return range
      } else {
        return new Range(range.raw, options)
      }
    }

    if (range instanceof Comparator) {
      // just put it in the set and return
      this.raw = range.value
      this.set = [[range]]
      this.formatted = undefined
      return this
    }

    this.options = options
    this.loose = !!options.loose
    this.includePrerelease = !!options.includePrerelease

    // First reduce all whitespace as much as possible so we do not have to rely
    // on potentially slow regexes like \s*. This is then stored and used for
    // future error messages as well.
    this.raw = range.trim().replace(SPACE_CHARACTERS, ' ')

    // First, split on ||
    this.set = this.raw
      .split('||')
      // map the range to a 2d array of comparators
      .map(r => this.parseRange(r.trim()))
      // throw out any comparator lists that are empty
      // this generally means that it was not a valid range, which is allowed
      // in loose mode, but will still throw if the WHOLE range is invalid.
      .filter(c => c.length)

    if (!this.set.length) {
      throw new TypeError(`Invalid SemVer Range: ${this.raw}`)
    }

    // if we have any that are not the null set, throw out null sets.
    if (this.set.length > 1) {
      // keep the first one, in case they're all null sets
      const first = this.set[0]
      this.set = this.set.filter(c => !isNullSet(c[0]))
      if (this.set.length === 0) {
        this.set = [first]
      } else if (this.set.length > 1) {
        // if we have any that are *, then the range is just *
        for (const c of this.set) {
          if (c.length === 1 && isAny(c[0])) {
            this.set = [c]
            break
          }
        }
      }
    }

    this.formatted = undefined
  }

  get range () {
    if (this.formatted === undefined) {
      this.formatted = ''
      for (let i = 0; i < this.set.length; i++) {
        if (i > 0) {
          this.formatted += '||'
        }
        const comps = this.set[i]
        for (let k = 0; k < comps.length; k++) {
          if (k > 0) {
            this.formatted += ' '
          }
          this.formatted += comps[k].toString().trim()
        }
      }
    }
    return this.formatted
  }

  format () {
    return this.range
  }

  toString () {
    return this.range
  }

  parseRange (range) {
    // strip build metadata so it can't bleed into the version
    range = range.replace(BUILDSTRIPRE, '')

    // memoize range parsing for performance.
    // this is a very hot path, and fully deterministic.
    const memoOpts =
      (this.options.includePrerelease && FLAG_INCLUDE_PRERELEASE) |
      (this.options.loose && FLAG_LOOSE)
    const memoKey = memoOpts + ':' + range
    const cached = cache.get(memoKey)
    if (cached) {
      return cached
    }

    const loose = this.options.loose
    // `1.2.3 - 1.2.4` => `>=1.2.3 <=1.2.4`
    const hr = loose ? re[t.HYPHENRANGELOOSE] : re[t.HYPHENRANGE]
    range = range.replace(hr, hyphenReplace(this.options.includePrerelease))
    debug('hyphen replace', range)

    // `> 1.2.3 < 1.2.5` => `>1.2.3 <1.2.5`
    range = trimComparatorWhitespace(range)
    debug('comparator trim', range)

    // `~ 1.2.3` => `~1.2.3`
    range = range.replace(re[t.TILDETRIM], tildeTrimReplace)
    debug('tilde trim', range)

    // `^ 1.2.3` => `^1.2.3`
    range = range.replace(re[t.CARETTRIM], caretTrimReplace)
    debug('caret trim', range)

    // At this point, the range is completely trimmed and
    // ready to be split into comparators.

    let rangeList = range
      .split(' ')
      .map(comp => parseComparator(comp, this.options))
      .join(' ')
      .split(/\s+/)
      // >=0.0.0 is equivalent to *
      .map(comp => replaceGTE0(comp, this.options))

    if (loose) {
      // in loose mode, throw out any that are not valid comparators
      rangeList = rangeList.filter(comp => {
        debug('loose invalid filter', comp, this.options)
        return !!comp.match(re[t.COMPARATORLOOSE])
      })
    }
    debug('range list', rangeList)

    // if any comparators are the null set, then replace with JUST null set
    // if more than one comparator, remove any * comparators
    // also, don't include the same comparator more than once
    const rangeMap = new Map()
    const comparators = rangeList.map(comp => new Comparator(comp, this.options))
    for (const comp of comparators) {
      if (isNullSet(comp)) {
        return [comp]
      }
      rangeMap.set(comp.value, comp)
    }
    if (rangeMap.size > 1 && rangeMap.has('')) {
      rangeMap.delete('')
    }

    const result = [...rangeMap.values()]
    cache.set(memoKey, result)
    return result
  }

  intersects (range, options) {
    if (!(range instanceof Range)) {
      throw new TypeError('a Range is required')
    }

    return this.set.some((thisComparators) => {
      return (
        isSatisfiable(thisComparators, options) &&
        range.set.some((rangeComparators) => {
          return (
            isSatisfiable(rangeComparators, options) &&
            thisComparators.every((thisComparator) => {
              return rangeComparators.every((rangeComparator) => {
                return thisComparator.intersects(rangeComparator, options)
              })
            })
          )
        })
      )
    })
  }

  // if ANY of the sets match ALL of its comparators, then pass
  test (version) {
    if (!version) {
      return false
    }

    if (typeof version === 'string') {
      try {
        version = new SemVer(version, this.options)
      } catch (er) {
        return false
      }
    }

    for (let i = 0; i < this.set.length; i++) {
      if (testSet(this.set[i], version, this.options)) {
        return true
      }
    }
    return false
  }
}

module.exports = Range

const LRU = __nccwpck_require__(383)
const cache = new LRU()

const parseOptions = __nccwpck_require__(356)
const Comparator = __nccwpck_require__(379)
const debug = __nccwpck_require__(159)
const SemVer = __nccwpck_require__(163)
const trimComparatorWhitespace = __nccwpck_require__(737)
const {
  safeRe: re,
  src,
  t,
  tildeTrimReplace,
  caretTrimReplace,
} = __nccwpck_require__(471)
const { FLAG_INCLUDE_PRERELEASE, FLAG_LOOSE } = __nccwpck_require__(101)

// unbounded global build-metadata stripper used by parseRange
const BUILDSTRIPRE = new RegExp(src[t.BUILD], 'g')

const isNullSet = c => c.value === '<0.0.0-0'
const isAny = c => c.value === ''

// take a set of comparators and determine whether there
// exists a version which can satisfy it
const isSatisfiable = (comparators, options) => {
  let result = true
  const remainingComparators = comparators.slice()
  let testComparator = remainingComparators.pop()

  while (result && remainingComparators.length) {
    result = remainingComparators.every((otherComparator) => {
      return testComparator.intersects(otherComparator, options)
    })

    testComparator = remainingComparators.pop()
  }

  return result
}

// comprised of xranges, tildes, stars, and gtlt's at this point.
// already replaced the hyphen ranges
// turn into a set of JUST comparators.
const parseComparator = (comp, options) => {
  comp = comp.replace(re[t.BUILD], '')
  debug('comp', comp, options)
  comp = replaceCarets(comp, options)
  debug('caret', comp)
  comp = replaceTildes(comp, options)
  debug('tildes', comp)
  comp = replaceXRanges(comp, options)
  debug('xrange', comp)
  comp = replaceStars(comp, options)
  debug('stars', comp)
  return comp
}

const isX = id => !id || id.toLowerCase() === 'x' || id === '*'

const invalidXRangeOrder = (M, m, p) => (
  (isX(M) && !isX(m)) ||
  (isX(m) && p && !isX(p))
)

// ~, ~> --> * (any, kinda silly)
// ~2, ~2.x, ~2.x.x, ~>2, ~>2.x ~>2.x.x --> >=2.0.0 <3.0.0-0
// ~2.0, ~2.0.x, ~>2.0, ~>2.0.x --> >=2.0.0 <2.1.0-0
// ~1.2, ~1.2.x, ~>1.2, ~>1.2.x --> >=1.2.0 <1.3.0-0
// ~1.2.3, ~>1.2.3 --> >=1.2.3 <1.3.0-0
// ~1.2.0, ~>1.2.0 --> >=1.2.0 <1.3.0-0
// ~0.0.1 --> >=0.0.1 <0.1.0-0
const replaceTildes = (comp, options) => {
  return comp
    .trim()
    .split(/\s+/)
    .map((c) => replaceTilde(c, options))
    .join(' ')
}

const replaceTilde = (comp, options) => {
  const r = options.loose ? re[t.TILDELOOSE] : re[t.TILDE]
  // if we're including prereleases in the match, then the lower bound is
  // -0, the lowest possible prerelease value, just like x-ranges and carets.
  // this keeps `~1.2` equivalent to the `1.2.x` x-range it's documented as.
  const z = options.includePrerelease ? '-0' : ''
  return comp.replace(r, (_, M, m, p, pr) => {
    debug('tilde', comp, _, M, m, p, pr)
    let ret

    if (isX(M)) {
      ret = ''
    } else if (isX(m)) {
      ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`
    } else if (isX(p)) {
      // ~1.2 == >=1.2.0 <1.3.0-0
      ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`
    } else if (pr) {
      debug('replaceTilde pr', pr)
      ret = `>=${M}.${m}.${p}-${pr
      } <${M}.${+m + 1}.0-0`
    } else {
      // ~1.2.3 == >=1.2.3 <1.3.0-0
      ret = `>=${M}.${m}.${p
      } <${M}.${+m + 1}.0-0`
    }

    debug('tilde return', ret)
    return ret
  })
}

// ^ --> * (any, kinda silly)
// ^2, ^2.x, ^2.x.x --> >=2.0.0 <3.0.0-0
// ^2.0, ^2.0.x --> >=2.0.0 <3.0.0-0
// ^1.2, ^1.2.x --> >=1.2.0 <2.0.0-0
// ^1.2.3 --> >=1.2.3 <2.0.0-0
// ^1.2.0 --> >=1.2.0 <2.0.0-0
// ^0.0.1 --> >=0.0.1 <0.0.2-0
// ^0.1.0 --> >=0.1.0 <0.2.0-0
const replaceCarets = (comp, options) => {
  return comp
    .trim()
    .split(/\s+/)
    .map((c) => replaceCaret(c, options))
    .join(' ')
}

const replaceCaret = (comp, options) => {
  debug('caret', comp, options)
  const r = options.loose ? re[t.CARETLOOSE] : re[t.CARET]
  const z = options.includePrerelease ? '-0' : ''
  return comp.replace(r, (_, M, m, p, pr) => {
    debug('caret', comp, _, M, m, p, pr)
    let ret

    if (isX(M)) {
      ret = ''
    } else if (isX(m)) {
      ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`
    } else if (isX(p)) {
      if (M === '0') {
        ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`
      } else {
        ret = `>=${M}.${m}.0${z} <${+M + 1}.0.0-0`
      }
    } else if (pr) {
      debug('replaceCaret pr', pr)
      if (M === '0') {
        if (m === '0') {
          ret = `>=${M}.${m}.${p}-${pr
          } <${M}.${m}.${+p + 1}-0`
        } else {
          ret = `>=${M}.${m}.${p}-${pr
          } <${M}.${+m + 1}.0-0`
        }
      } else {
        ret = `>=${M}.${m}.${p}-${pr
        } <${+M + 1}.0.0-0`
      }
    } else {
      debug('no pr')
      if (M === '0') {
        if (m === '0') {
          ret = `>=${M}.${m}.${p
          } <${M}.${m}.${+p + 1}-0`
        } else {
          ret = `>=${M}.${m}.${p
          } <${M}.${+m + 1}.0-0`
        }
      } else {
        ret = `>=${M}.${m}.${p
        } <${+M + 1}.0.0-0`
      }
    }

    debug('caret return', ret)
    return ret
  })
}

const replaceXRanges = (comp, options) => {
  debug('replaceXRanges', comp, options)
  return comp
    .split(/\s+/)
    .map((c) => replaceXRange(c, options))
    .join(' ')
}

const replaceXRange = (comp, options) => {
  comp = comp.trim()
  const r = options.loose ? re[t.XRANGELOOSE] : re[t.XRANGE]
  return comp.replace(r, (ret, gtlt, M, m, p, pr) => {
    debug('xRange', comp, ret, gtlt, M, m, p, pr)
    if (invalidXRangeOrder(M, m, p)) {
      return comp
    }

    const xM = isX(M)
    const xm = xM || isX(m)
    const xp = xm || isX(p)
    const anyX = xp

    if (gtlt === '=' && anyX) {
      gtlt = ''
    }

    // if we're including prereleases in the match, then we need
    // to fix this to -0, the lowest possible prerelease value
    pr = options.includePrerelease ? '-0' : ''

    if (xM) {
      if (gtlt === '>' || gtlt === '<') {
        // nothing is allowed
        ret = '<0.0.0-0'
      } else {
        // nothing is forbidden
        ret = '*'
      }
    } else if (gtlt && anyX) {
      // we know patch is an x, because we have any x at all.
      // replace X with 0
      if (xm) {
        m = 0
      }
      p = 0

      if (gtlt === '>') {
        // >1 => >=2.0.0
        // >1.2 => >=1.3.0
        gtlt = '>='
        if (xm) {
          M = +M + 1
          m = 0
          p = 0
        } else {
          m = +m + 1
          p = 0
        }
      } else if (gtlt === '<=') {
        // <=0.7.x is actually <0.8.0, since any 0.7.x should
        // pass.  Similarly, <=7.x is actually <8.0.0, etc.
        gtlt = '<'
        if (xm) {
          M = +M + 1
        } else {
          m = +m + 1
        }
      }

      if (gtlt === '<') {
        pr = '-0'
      }

      ret = `${gtlt + M}.${m}.${p}${pr}`
    } else if (xm) {
      ret = `>=${M}.0.0${pr} <${+M + 1}.0.0-0`
    } else if (xp) {
      ret = `>=${M}.${m}.0${pr
      } <${M}.${+m + 1}.0-0`
    }

    debug('xRange return', ret)

    return ret
  })
}

// Because * is AND-ed with everything else in the comparator,
// and '' means "any version", just remove the *s entirely.
const replaceStars = (comp, options) => {
  debug('replaceStars', comp, options)
  // Looseness is ignored here.  star is always as loose as it gets!
  return comp
    .trim()
    .replace(re[t.STAR], '')
}

const replaceGTE0 = (comp, options) => {
  debug('replaceGTE0', comp, options)
  return comp
    .trim()
    .replace(re[options.includePrerelease ? t.GTE0PRE : t.GTE0], '')
}

// This function is passed to string.replace(re[t.HYPHENRANGE])
// M, m, patch, prerelease, build
// 1.2 - 3.4.5 => >=1.2.0 <=3.4.5
// 1.2.3 - 3.4 => >=1.2.0 <3.5.0-0 Any 3.4.x will do
// 1.2 - 3.4 => >=1.2.0 <3.5.0-0
// TODO build?
const hyphenReplace = incPr => ($0,
  from, fM, fm, fp, fpr, fb,
  to, tM, tm, tp, tpr) => {
  if (isX(fM)) {
    from = ''
  } else if (isX(fm)) {
    from = `>=${fM}.0.0${incPr ? '-0' : ''}`
  } else if (isX(fp)) {
    from = `>=${fM}.${fm}.0${incPr ? '-0' : ''}`
  } else if (fpr) {
    from = `>=${from}`
  } else {
    from = `>=${from}${incPr ? '-0' : ''}`
  }

  if (isX(tM)) {
    to = ''
  } else if (isX(tm)) {
    to = `<${+tM + 1}.0.0-0`
  } else if (isX(tp)) {
    to = `<${tM}.${+tm + 1}.0-0`
  } else if (tpr) {
    to = `<=${tM}.${tm}.${tp}-${tpr}`
  } else if (incPr) {
    to = `<${tM}.${tm}.${+tp + 1}-0`
  } else {
    to = `<=${to}`
  }

  return `${from} ${to}`.trim()
}

const testSet = (set, version, options) => {
  for (let i = 0; i < set.length; i++) {
    if (!set[i].test(version)) {
      return false
    }
  }

  if (version.prerelease.length && !options.includePrerelease) {
    // Find the set of versions that are allowed to have prereleases
    // For example, ^1.2.3-pr.1 desugars to >=1.2.3-pr.1 <2.0.0
    // That should allow `1.2.3-pr.2` to pass.
    // However, `1.2.4-alpha.notready` should NOT be allowed,
    // even though it's within the range set by the comparators.
    for (let i = 0; i < set.length; i++) {
      debug(set[i].semver)
      if (set[i].semver === Comparator.ANY) {
        continue
      }

      if (set[i].semver.prerelease.length > 0) {
        const allowed = set[i].semver
        if (allowed.major === version.major &&
            allowed.minor === version.minor &&
            allowed.patch === version.patch) {
          return true
        }
      }
    }

    // Version has a -pre, but it's not one of the ones we like.
    return false
  }

  return true
}


/***/ }),

/***/ 163:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const debug = __nccwpck_require__(159)
const { MAX_LENGTH, MAX_SAFE_INTEGER } = __nccwpck_require__(101)
const { safeRe: re, t } = __nccwpck_require__(471)

const parseOptions = __nccwpck_require__(356)
const { compareIdentifiers } = __nccwpck_require__(348)

const isPrereleaseIdentifier = (prerelease, identifier) => {
  const identifiers = identifier.split('.')
  if (identifiers.length > prerelease.length) {
    return false
  }

  for (let i = 0; i < identifiers.length; i++) {
    if (compareIdentifiers(prerelease[i], identifiers[i]) !== 0) {
      return false
    }
  }

  return true
}

class SemVer {
  constructor (version, options) {
    options = parseOptions(options)

    if (version instanceof SemVer) {
      if (version.loose === !!options.loose &&
        version.includePrerelease === !!options.includePrerelease) {
        return version
      } else {
        version = version.version
      }
    } else if (typeof version !== 'string') {
      throw new TypeError(`Invalid version. Must be a string. Got type "${typeof version}".`)
    }

    if (version.length > MAX_LENGTH) {
      throw new TypeError(
        `version is longer than ${MAX_LENGTH} characters`
      )
    }

    debug('SemVer', version, options)
    this.options = options
    this.loose = !!options.loose
    // this isn't actually relevant for versions, but keep it so that we
    // don't run into trouble passing this.options around.
    this.includePrerelease = !!options.includePrerelease

    const m = version.trim().match(options.loose ? re[t.LOOSE] : re[t.FULL])

    if (!m) {
      throw new TypeError(`Invalid Version: ${version}`)
    }

    this.raw = version

    // these are actually numbers
    this.major = +m[1]
    this.minor = +m[2]
    this.patch = +m[3]

    if (this.major > MAX_SAFE_INTEGER || this.major < 0) {
      throw new TypeError('Invalid major version')
    }

    if (this.minor > MAX_SAFE_INTEGER || this.minor < 0) {
      throw new TypeError('Invalid minor version')
    }

    if (this.patch > MAX_SAFE_INTEGER || this.patch < 0) {
      throw new TypeError('Invalid patch version')
    }

    // numberify any prerelease numeric ids
    if (!m[4]) {
      this.prerelease = []
    } else {
      this.prerelease = m[4].split('.').map((id) => {
        if (/^[0-9]+$/.test(id)) {
          const num = +id
          if (num >= 0 && num < MAX_SAFE_INTEGER) {
            return num
          }
        }
        return id
      })
    }

    this.build = m[5] ? m[5].split('.') : []
    this.format()
  }

  format () {
    this.version = `${this.major}.${this.minor}.${this.patch}`
    if (this.prerelease.length) {
      this.version += `-${this.prerelease.join('.')}`
    }
    return this.version
  }

  toString () {
    return this.version
  }

  compare (other) {
    debug('SemVer.compare', this.version, this.options, other)
    if (!(other instanceof SemVer)) {
      if (typeof other === 'string' && other === this.version) {
        return 0
      }
      other = new SemVer(other, this.options)
    }

    if (other.version === this.version) {
      return 0
    }

    return this.compareMain(other) || this.comparePre(other)
  }

  compareMain (other) {
    if (!(other instanceof SemVer)) {
      other = new SemVer(other, this.options)
    }

    if (this.major < other.major) {
      return -1
    }
    if (this.major > other.major) {
      return 1
    }
    if (this.minor < other.minor) {
      return -1
    }
    if (this.minor > other.minor) {
      return 1
    }
    if (this.patch < other.patch) {
      return -1
    }
    if (this.patch > other.patch) {
      return 1
    }
    return 0
  }

  comparePre (other) {
    if (!(other instanceof SemVer)) {
      other = new SemVer(other, this.options)
    }

    // NOT having a prerelease is > having one
    if (this.prerelease.length && !other.prerelease.length) {
      return -1
    } else if (!this.prerelease.length && other.prerelease.length) {
      return 1
    } else if (!this.prerelease.length && !other.prerelease.length) {
      return 0
    }

    let i = 0
    do {
      const a = this.prerelease[i]
      const b = other.prerelease[i]
      debug('prerelease compare', i, a, b)
      if (a === undefined && b === undefined) {
        return 0
      } else if (b === undefined) {
        return 1
      } else if (a === undefined) {
        return -1
      } else if (a === b) {
        continue
      } else {
        return compareIdentifiers(a, b)
      }
    } while (++i)
  }

  compareBuild (other) {
    if (!(other instanceof SemVer)) {
      other = new SemVer(other, this.options)
    }

    let i = 0
    do {
      const a = this.build[i]
      const b = other.build[i]
      debug('build compare', i, a, b)
      if (a === undefined && b === undefined) {
        return 0
      } else if (b === undefined) {
        return 1
      } else if (a === undefined) {
        return -1
      } else if (a === b) {
        continue
      } else {
        return compareIdentifiers(a, b)
      }
    } while (++i)
  }

  // preminor will bump the version up to the next minor release, and immediately
  // down to pre-release. premajor and prepatch work the same way.
  inc (release, identifier, identifierBase) {
    if (release.startsWith('pre')) {
      if (!identifier && identifierBase === false) {
        throw new Error('invalid increment argument: identifier is empty')
      }
      // Avoid an invalid semver results
      if (identifier) {
        const match = `-${identifier}`.match(this.options.loose ? re[t.PRERELEASELOOSE] : re[t.PRERELEASE])
        if (!match || match[1] !== identifier) {
          throw new Error(`invalid identifier: ${identifier}`)
        }
      }
    }

    switch (release) {
      case 'premajor':
        this.prerelease.length = 0
        this.patch = 0
        this.minor = 0
        this.major++
        this.inc('pre', identifier, identifierBase)
        break
      case 'preminor':
        this.prerelease.length = 0
        this.patch = 0
        this.minor++
        this.inc('pre', identifier, identifierBase)
        break
      case 'prepatch':
        // If this is already a prerelease, it will bump to the next version
        // drop any prereleases that might already exist, since they are not
        // relevant at this point.
        this.prerelease.length = 0
        this.inc('patch', identifier, identifierBase)
        this.inc('pre', identifier, identifierBase)
        break
      // If the input is a non-prerelease version, this acts the same as
      // prepatch.
      case 'prerelease':
        if (this.prerelease.length === 0) {
          this.inc('patch', identifier, identifierBase)
        }
        this.inc('pre', identifier, identifierBase)
        break
      case 'release':
        if (this.prerelease.length === 0) {
          throw new Error(`version ${this.raw} is not a prerelease`)
        }
        this.prerelease.length = 0
        break

      case 'major':
        // If this is a pre-major version, bump up to the same major version.
        // Otherwise increment major.
        // 1.0.0-5 bumps to 1.0.0
        // 1.1.0 bumps to 2.0.0
        if (
          this.minor !== 0 ||
          this.patch !== 0 ||
          this.prerelease.length === 0
        ) {
          this.major++
        }
        this.minor = 0
        this.patch = 0
        this.prerelease = []
        break
      case 'minor':
        // If this is a pre-minor version, bump up to the same minor version.
        // Otherwise increment minor.
        // 1.2.0-5 bumps to 1.2.0
        // 1.2.1 bumps to 1.3.0
        if (this.patch !== 0 || this.prerelease.length === 0) {
          this.minor++
        }
        this.patch = 0
        this.prerelease = []
        break
      case 'patch':
        // If this is not a pre-release version, it will increment the patch.
        // If it is a pre-release it will bump up to the same patch version.
        // 1.2.0-5 patches to 1.2.0
        // 1.2.0 patches to 1.2.1
        if (this.prerelease.length === 0) {
          this.patch++
        }
        this.prerelease = []
        break
      // This probably shouldn't be used publicly.
      // 1.0.0 'pre' would become 1.0.0-0 which is the wrong direction.
      case 'pre': {
        const base = Number(identifierBase) ? 1 : 0

        if (this.prerelease.length === 0) {
          this.prerelease = [base]
        } else {
          let i = this.prerelease.length
          while (--i >= 0) {
            if (typeof this.prerelease[i] === 'number') {
              this.prerelease[i]++
              i = -2
            }
          }
          if (i === -1) {
            // didn't increment anything
            if (identifier === this.prerelease.join('.') && identifierBase === false) {
              throw new Error('invalid increment argument: identifier already exists')
            }
            this.prerelease.push(base)
          }
        }
        if (identifier) {
          // 1.2.0-beta.1 bumps to 1.2.0-beta.2,
          // 1.2.0-beta.fooblz or 1.2.0-beta bumps to 1.2.0-beta.0
          let prerelease = [identifier, base]
          if (identifierBase === false) {
            prerelease = [identifier]
          }
          if (isPrereleaseIdentifier(this.prerelease, identifier)) {
            const prereleaseBase = this.prerelease[identifier.split('.').length]
            if (isNaN(prereleaseBase)) {
              this.prerelease = prerelease
            }
          } else {
            this.prerelease = prerelease
          }
        }
        break
      }
      default:
        throw new Error(`invalid increment argument: ${release}`)
    }
    this.raw = this.format()
    if (this.build.length) {
      this.raw += `+${this.build.join('.')}`
    }
    return this
  }
}

module.exports = SemVer


/***/ }),

/***/ 799:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const parse = __nccwpck_require__(353)
const clean = (version, options) => {
  const s = parse(version.trim().replace(/^[=v]+/, ''), options)
  return s ? s.version : null
}
module.exports = clean


/***/ }),

/***/ 646:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const eq = __nccwpck_require__(82)
const neq = __nccwpck_require__(974)
const gt = __nccwpck_require__(599)
const gte = __nccwpck_require__(236)
const lt = __nccwpck_require__(491)
const lte = __nccwpck_require__(717)

const cmp = (a, op, b, loose) => {
  switch (op) {
    case '===':
      if (typeof a === 'object') {
        a = a.version
      }
      if (typeof b === 'object') {
        b = b.version
      }
      return a === b

    case '!==':
      if (typeof a === 'object') {
        a = a.version
      }
      if (typeof b === 'object') {
        b = b.version
      }
      return a !== b

    case '':
    case '=':
    case '==':
      return eq(a, b, loose)

    case '!=':
      return neq(a, b, loose)

    case '>':
      return gt(a, b, loose)

    case '>=':
      return gte(a, b, loose)

    case '<':
      return lt(a, b, loose)

    case '<=':
      return lte(a, b, loose)

    default:
      throw new TypeError(`Invalid operator: ${op}`)
  }
}
module.exports = cmp


/***/ }),

/***/ 385:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const SemVer = __nccwpck_require__(163)
const parse = __nccwpck_require__(353)
const { safeRe: re, t } = __nccwpck_require__(471)

const coerce = (version, options) => {
  if (version instanceof SemVer) {
    return version
  }

  if (typeof version === 'number') {
    version = String(version)
  }

  if (typeof version !== 'string') {
    return null
  }

  options = options || {}

  let match = null
  if (!options.rtl) {
    match = version.match(options.includePrerelease ? re[t.COERCEFULL] : re[t.COERCE])
  } else {
    // Find the right-most coercible string that does not share
    // a terminus with a more left-ward coercible string.
    // Eg, '1.2.3.4' wants to coerce '2.3.4', not '3.4' or '4'
    // With includePrerelease option set, '1.2.3.4-rc' wants to coerce '2.3.4-rc', not '2.3.4'
    //
    // Walk through the string checking with a /g regexp
    // Manually set the index so as to pick up overlapping matches.
    // Stop when we get a match that ends at the string end, since no
    // coercible string can be more right-ward without the same terminus.
    const coerceRtlRegex = options.includePrerelease ? re[t.COERCERTLFULL] : re[t.COERCERTL]
    let next
    while ((next = coerceRtlRegex.exec(version)) &&
        (!match || match.index + match[0].length !== version.length)
    ) {
      if (!match ||
            next.index + next[0].length !== match.index + match[0].length) {
        match = next
      }
      coerceRtlRegex.lastIndex = next.index + next[1].length + next[2].length
    }
    // leave it in a clean state
    coerceRtlRegex.lastIndex = -1
  }

  if (match === null) {
    return null
  }

  const major = match[2]
  const minor = match[3] || '0'
  const patch = match[4] || '0'
  const prerelease = options.includePrerelease && match[5] ? `-${match[5]}` : ''
  const build = options.includePrerelease && match[6] ? `+${match[6]}` : ''

  return parse(`${major}.${minor}.${patch}${prerelease}${build}`, options)
}
module.exports = coerce


/***/ }),

/***/ 648:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const SemVer = __nccwpck_require__(163)
const compareBuild = (a, b, loose) => {
  const versionA = new SemVer(a, loose)
  const versionB = new SemVer(b, loose)
  return versionA.compare(versionB) || versionA.compareBuild(versionB)
}
module.exports = compareBuild


/***/ }),

/***/ 874:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const compare = __nccwpck_require__(469)
const compareLoose = (a, b) => compare(a, b, true)
module.exports = compareLoose


/***/ }),

/***/ 469:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const SemVer = __nccwpck_require__(163)
const compare = (a, b, loose) =>
  new SemVer(a, loose).compare(new SemVer(b, loose))

module.exports = compare


/***/ }),

/***/ 711:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const parse = __nccwpck_require__(353)

const diff = (version1, version2) => {
  const v1 = parse(version1, null, true)
  const v2 = parse(version2, null, true)
  const comparison = v1.compare(v2)

  if (comparison === 0) {
    return null
  }

  const v1Higher = comparison > 0
  const highVersion = v1Higher ? v1 : v2
  const lowVersion = v1Higher ? v2 : v1
  const highHasPre = !!highVersion.prerelease.length
  const lowHasPre = !!lowVersion.prerelease.length

  if (lowHasPre && !highHasPre) {
    // Going from prerelease -> no prerelease requires some special casing

    // If the low version has only a major, then it will always be a major
    // Some examples:
    // 1.0.0-1 -> 1.0.0
    // 1.0.0-1 -> 1.1.1
    // 1.0.0-1 -> 2.0.0
    if (!lowVersion.patch && !lowVersion.minor) {
      return 'major'
    }

    // If the main part has no difference
    if (lowVersion.compareMain(highVersion) === 0) {
      if (lowVersion.minor && !lowVersion.patch) {
        return 'minor'
      }
      return 'patch'
    }
  }

  // add the `pre` prefix if we are going to a prerelease version
  const prefix = highHasPre ? 'pre' : ''

  if (v1.major !== v2.major) {
    return prefix + 'major'
  }

  if (v1.minor !== v2.minor) {
    return prefix + 'minor'
  }

  if (v1.patch !== v2.patch) {
    return prefix + 'patch'
  }

  // high and low are prereleases
  return 'prerelease'
}

module.exports = diff


/***/ }),

/***/ 82:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const compare = __nccwpck_require__(469)
const eq = (a, b, loose) => compare(a, b, loose) === 0
module.exports = eq


/***/ }),

/***/ 599:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const compare = __nccwpck_require__(469)
const gt = (a, b, loose) => compare(a, b, loose) > 0
module.exports = gt


/***/ }),

/***/ 236:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const compare = __nccwpck_require__(469)
const gte = (a, b, loose) => compare(a, b, loose) >= 0
module.exports = gte


/***/ }),

/***/ 338:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const SemVer = __nccwpck_require__(163)

const inc = (version, release, options, identifier, identifierBase) => {
  if (typeof (options) === 'string') {
    identifierBase = identifier
    identifier = options
    options = undefined
  }

  try {
    return new SemVer(
      version instanceof SemVer ? version.version : version,
      options
    ).inc(release, identifier, identifierBase).version
  } catch (er) {
    return null
  }
}
module.exports = inc


/***/ }),

/***/ 491:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const compare = __nccwpck_require__(469)
const lt = (a, b, loose) => compare(a, b, loose) < 0
module.exports = lt


/***/ }),

/***/ 717:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const compare = __nccwpck_require__(469)
const lte = (a, b, loose) => compare(a, b, loose) <= 0
module.exports = lte


/***/ }),

/***/ 511:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const SemVer = __nccwpck_require__(163)
const major = (a, loose) => new SemVer(a, loose).major
module.exports = major


/***/ }),

/***/ 603:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const SemVer = __nccwpck_require__(163)
const minor = (a, loose) => new SemVer(a, loose).minor
module.exports = minor


/***/ }),

/***/ 974:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const compare = __nccwpck_require__(469)
const neq = (a, b, loose) => compare(a, b, loose) !== 0
module.exports = neq


/***/ }),

/***/ 353:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const SemVer = __nccwpck_require__(163)
const parse = (version, options, throwErrors = false) => {
  if (version instanceof SemVer) {
    return version
  }
  try {
    return new SemVer(version, options)
  } catch (er) {
    if (!throwErrors) {
      return null
    }
    throw er
  }
}

module.exports = parse


/***/ }),

/***/ 756:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const SemVer = __nccwpck_require__(163)
const patch = (a, loose) => new SemVer(a, loose).patch
module.exports = patch


/***/ }),

/***/ 714:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const parse = __nccwpck_require__(353)
const prerelease = (version, options) => {
  const parsed = parse(version, options)
  return (parsed && parsed.prerelease.length) ? parsed.prerelease : null
}
module.exports = prerelease


/***/ }),

/***/ 173:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const compare = __nccwpck_require__(469)
const rcompare = (a, b, loose) => compare(b, a, loose)
module.exports = rcompare


/***/ }),

/***/ 192:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const compareBuild = __nccwpck_require__(648)
const rsort = (list, loose) => list.sort((a, b) => compareBuild(b, a, loose))
module.exports = rsort


/***/ }),

/***/ 11:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const Range = __nccwpck_require__(782)
const satisfies = (version, range, options) => {
  try {
    range = new Range(range, options)
  } catch (er) {
    return false
  }
  return range.test(version)
}
module.exports = satisfies


/***/ }),

/***/ 872:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const compareBuild = __nccwpck_require__(648)
const sort = (list, loose) => list.sort((a, b) => compareBuild(a, b, loose))
module.exports = sort


/***/ }),

/***/ 114:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const parse = __nccwpck_require__(353)
const constants = __nccwpck_require__(101)
const SemVer = __nccwpck_require__(163)

const truncate = (version, truncation, options) => {
  if (!constants.RELEASE_TYPES.includes(truncation)) {
    return null
  }

  const clonedVersion = cloneInputVersion(version, options)
  return clonedVersion && doTruncation(clonedVersion, truncation)
}

const cloneInputVersion = (version, options) => {
  const versionStringToParse = (
    version instanceof SemVer ? version.version : version
  )

  return parse(versionStringToParse, options)
}

const doTruncation = (version, truncation) => {
  if (isPrerelease(truncation)) {
    return version.version
  }

  version.prerelease = []

  switch (truncation) {
    case 'major':
      version.minor = 0
      version.patch = 0
      break
    case 'minor':
      version.patch = 0
      break
  }

  return version.format()
}

const isPrerelease = (type) => {
  return type.startsWith('pre')
}

module.exports = truncate


/***/ }),

/***/ 780:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const parse = __nccwpck_require__(353)
const valid = (version, options) => {
  const v = parse(version, options)
  return v ? v.version : null
}
module.exports = valid


/***/ }),

/***/ 88:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



// just pre-load all the stuff that index.js lazily exports
const internalRe = __nccwpck_require__(471)
const constants = __nccwpck_require__(101)
const SemVer = __nccwpck_require__(163)
const identifiers = __nccwpck_require__(348)
const parse = __nccwpck_require__(353)
const valid = __nccwpck_require__(780)
const clean = __nccwpck_require__(799)
const inc = __nccwpck_require__(338)
const diff = __nccwpck_require__(711)
const major = __nccwpck_require__(511)
const minor = __nccwpck_require__(603)
const patch = __nccwpck_require__(756)
const prerelease = __nccwpck_require__(714)
const compare = __nccwpck_require__(469)
const rcompare = __nccwpck_require__(173)
const compareLoose = __nccwpck_require__(874)
const compareBuild = __nccwpck_require__(648)
const sort = __nccwpck_require__(872)
const rsort = __nccwpck_require__(192)
const gt = __nccwpck_require__(599)
const lt = __nccwpck_require__(491)
const eq = __nccwpck_require__(82)
const neq = __nccwpck_require__(974)
const gte = __nccwpck_require__(236)
const lte = __nccwpck_require__(717)
const cmp = __nccwpck_require__(646)
const coerce = __nccwpck_require__(385)
const truncate = __nccwpck_require__(114)
const Comparator = __nccwpck_require__(379)
const Range = __nccwpck_require__(782)
const satisfies = __nccwpck_require__(11)
const toComparators = __nccwpck_require__(750)
const maxSatisfying = __nccwpck_require__(193)
const minSatisfying = __nccwpck_require__(595)
const minVersion = __nccwpck_require__(866)
const validRange = __nccwpck_require__(118)
const outside = __nccwpck_require__(280)
const gtr = __nccwpck_require__(276)
const ltr = __nccwpck_require__(213)
const intersects = __nccwpck_require__(465)
const simplifyRange = __nccwpck_require__(28)
const subset = __nccwpck_require__(489)
module.exports = {
  parse,
  valid,
  clean,
  inc,
  diff,
  major,
  minor,
  patch,
  prerelease,
  compare,
  rcompare,
  compareLoose,
  compareBuild,
  sort,
  rsort,
  gt,
  lt,
  eq,
  neq,
  gte,
  lte,
  cmp,
  coerce,
  truncate,
  Comparator,
  Range,
  satisfies,
  toComparators,
  maxSatisfying,
  minSatisfying,
  minVersion,
  validRange,
  outside,
  gtr,
  ltr,
  intersects,
  simplifyRange,
  subset,
  SemVer,
  re: internalRe.re,
  src: internalRe.src,
  tokens: internalRe.t,
  SEMVER_SPEC_VERSION: constants.SEMVER_SPEC_VERSION,
  RELEASE_TYPES: constants.RELEASE_TYPES,
  compareIdentifiers: identifiers.compareIdentifiers,
  rcompareIdentifiers: identifiers.rcompareIdentifiers,
}


/***/ }),

/***/ 101:
/***/ ((module) => {



// Note: this is the semver.org version of the spec that it implements
// Not necessarily the package version of this code.
const SEMVER_SPEC_VERSION = '2.0.0'

const MAX_LENGTH = 256
const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER ||
/* istanbul ignore next */ 9007199254740991

// Max safe segment length for coercion.
const MAX_SAFE_COMPONENT_LENGTH = 16

// Max safe length for a build identifier. The max length minus 6 characters for
// the shortest version with a build 0.0.0+BUILD.
const MAX_SAFE_BUILD_LENGTH = MAX_LENGTH - 6

// ECMAScript whitespace and line terminators matched by \s.
const WHITESPACE_CHARACTERS = [
  '\t',
  '\n',
  '\v',
  '\f',
  '\r',
  ' ',
  '\u00a0',
  '\u1680',
  '\u2000',
  '\u2001',
  '\u2002',
  '\u2003',
  '\u2004',
  '\u2005',
  '\u2006',
  '\u2007',
  '\u2008',
  '\u2009',
  '\u200a',
  '\u2028',
  '\u2029',
  '\u202f',
  '\u205f',
  '\u3000',
  '\ufeff',
]

const RELEASE_TYPES = [
  'major',
  'premajor',
  'minor',
  'preminor',
  'patch',
  'prepatch',
  'prerelease',
]

module.exports = {
  MAX_LENGTH,
  MAX_SAFE_COMPONENT_LENGTH,
  MAX_SAFE_BUILD_LENGTH,
  MAX_SAFE_INTEGER,
  WHITESPACE_CHARACTERS,
  RELEASE_TYPES,
  SEMVER_SPEC_VERSION,
  FLAG_INCLUDE_PRERELEASE: 0b001,
  FLAG_LOOSE: 0b010,
}


/***/ }),

/***/ 159:
/***/ ((module) => {



const debug = (
  typeof process === 'object' &&
  process.env &&
  process.env.NODE_DEBUG &&
  /\bsemver\b/i.test(process.env.NODE_DEBUG)
) ? (...args) => console.error('SEMVER', ...args)
  : () => {}

module.exports = debug


/***/ }),

/***/ 348:
/***/ ((module) => {



const numeric = /^[0-9]+$/
const compareIdentifiers = (a, b) => {
  if (typeof a === 'number' && typeof b === 'number') {
    return a === b ? 0 : a < b ? -1 : 1
  }

  const anum = numeric.test(a)
  const bnum = numeric.test(b)

  if (anum && bnum) {
    a = +a
    b = +b
  }

  return a === b ? 0
    : (anum && !bnum) ? -1
    : (bnum && !anum) ? 1
    : a < b ? -1
    : 1
}

const rcompareIdentifiers = (a, b) => compareIdentifiers(b, a)

module.exports = {
  compareIdentifiers,
  rcompareIdentifiers,
}


/***/ }),

/***/ 383:
/***/ ((module) => {



class LRUCache {
  constructor () {
    this.max = 1000
    this.map = new Map()
  }

  get (key) {
    const value = this.map.get(key)
    if (value === undefined) {
      return undefined
    } else {
      // Remove the key from the map and add it to the end
      this.map.delete(key)
      this.map.set(key, value)
      return value
    }
  }

  delete (key) {
    return this.map.delete(key)
  }

  set (key, value) {
    const deleted = this.delete(key)

    if (!deleted && value !== undefined) {
      // If cache is full, delete the least recently used item
      if (this.map.size >= this.max) {
        const firstKey = this.map.keys().next().value
        this.delete(firstKey)
      }

      this.map.set(key, value)
    }

    return this
  }
}

module.exports = LRUCache


/***/ }),

/***/ 356:
/***/ ((module) => {



// parse out just the options we care about
const looseOption = Object.freeze({ loose: true })
const emptyOpts = Object.freeze({ })
const parseOptions = options => {
  if (!options) {
    return emptyOpts
  }

  if (typeof options !== 'object') {
    return looseOption
  }

  return options
}
module.exports = parseOptions


/***/ }),

/***/ 471:
/***/ ((module, exports, __nccwpck_require__) => {



const {
  MAX_SAFE_COMPONENT_LENGTH,
  MAX_SAFE_BUILD_LENGTH,
  MAX_LENGTH,
} = __nccwpck_require__(101)
const debug = __nccwpck_require__(159)
exports = module.exports = {}

// The actual regexps go on exports.re
const re = exports.re = []
const safeRe = exports.safeRe = []
const src = exports.src = []
const safeSrc = exports.safeSrc = []
const t = exports.t = {}
let R = 0

const LETTERDASHNUMBER = '[a-zA-Z0-9-]'

// Replace some greedy regex tokens to prevent regex dos issues. These regex are
// used internally via the safeRe object since all inputs in this library get
// normalized first to trim and collapse all extra whitespace. The original
// regexes are exported for userland consumption and lower level usage. A
// future breaking change could export the safer regex only with a note that
// all input should have extra whitespace removed.
const safeRegexReplacements = [
  ['\\s', 1],
  ['\\d', MAX_LENGTH],
  [LETTERDASHNUMBER, MAX_SAFE_BUILD_LENGTH],
]

const makeSafeRegex = (value) => {
  for (const [token, max] of safeRegexReplacements) {
    value = value
      .split(`${token}*`).join(`${token}{0,${max}}`)
      .split(`${token}+`).join(`${token}{1,${max}}`)
  }
  return value
}

const createToken = (name, value, isGlobal) => {
  const safe = makeSafeRegex(value)
  const index = R++
  debug(name, index, value)
  t[name] = index
  src[index] = value
  safeSrc[index] = safe
  re[index] = new RegExp(value, isGlobal ? 'g' : undefined)
  safeRe[index] = new RegExp(safe, isGlobal ? 'g' : undefined)
}

// The following Regular Expressions can be used for tokenizing,
// validating, and parsing SemVer version strings.

// ## Numeric Identifier
// A single `0`, or a non-zero digit followed by zero or more digits.

createToken('NUMERICIDENTIFIER', '0|[1-9]\\d*')
createToken('NUMERICIDENTIFIERLOOSE', '\\d+')

// ## Non-numeric Identifier
// Zero or more digits, followed by a letter or hyphen, and then zero or
// more letters, digits, or hyphens.

createToken('NONNUMERICIDENTIFIER', `\\d*[a-zA-Z-]${LETTERDASHNUMBER}*`)

// ## Main Version
// Three dot-separated numeric identifiers.

createToken('MAINVERSION', `(${src[t.NUMERICIDENTIFIER]})\\.` +
                   `(${src[t.NUMERICIDENTIFIER]})\\.` +
                   `(${src[t.NUMERICIDENTIFIER]})`)

createToken('MAINVERSIONLOOSE', `(${src[t.NUMERICIDENTIFIERLOOSE]})\\.` +
                        `(${src[t.NUMERICIDENTIFIERLOOSE]})\\.` +
                        `(${src[t.NUMERICIDENTIFIERLOOSE]})`)

// ## Pre-release Version Identifier
// A numeric identifier, or a non-numeric identifier.
// Non-numeric identifiers include numeric identifiers but can be longer.
// Therefore non-numeric identifiers must go first.

createToken('PRERELEASEIDENTIFIER', `(?:${src[t.NONNUMERICIDENTIFIER]
}|${src[t.NUMERICIDENTIFIER]})`)

createToken('PRERELEASEIDENTIFIERLOOSE', `(?:${src[t.NONNUMERICIDENTIFIER]
}|${src[t.NUMERICIDENTIFIERLOOSE]})`)

// ## Pre-release Version
// Hyphen, followed by one or more dot-separated pre-release version
// identifiers.

createToken('PRERELEASE', `(?:-(${src[t.PRERELEASEIDENTIFIER]
}(?:\\.${src[t.PRERELEASEIDENTIFIER]})*))`)

createToken('PRERELEASELOOSE', `(?:-?(${src[t.PRERELEASEIDENTIFIERLOOSE]
}(?:\\.${src[t.PRERELEASEIDENTIFIERLOOSE]})*))`)

// ## Build Metadata Identifier
// Any combination of digits, letters, or hyphens.

createToken('BUILDIDENTIFIER', `${LETTERDASHNUMBER}+`)

// ## Build Metadata
// Plus sign, followed by one or more period-separated build metadata
// identifiers.

createToken('BUILD', `(?:\\+(${src[t.BUILDIDENTIFIER]
}(?:\\.${src[t.BUILDIDENTIFIER]})*))`)

// ## Full Version String
// A main version, followed optionally by a pre-release version and
// build metadata.

// Note that the only major, minor, patch, and pre-release sections of
// the version string are capturing groups.  The build metadata is not a
// capturing group, because it should not ever be used in version
// comparison.

createToken('FULLPLAIN', `v?${src[t.MAINVERSION]
}${src[t.PRERELEASE]}?${
  src[t.BUILD]}?`)

createToken('FULL', `^${src[t.FULLPLAIN]}$`)

// like full, but allows v1.2.3 and =1.2.3, which people do sometimes.
// also, 1.0.0alpha1 (prerelease without the hyphen) which is pretty
// common in the npm registry.
createToken('LOOSEPLAIN', `[v=\\s]*${src[t.MAINVERSIONLOOSE]
}${src[t.PRERELEASELOOSE]}?${
  src[t.BUILD]}?`)

createToken('LOOSE', `^${src[t.LOOSEPLAIN]}$`)

createToken('GTLT', '((?:<|>)?=?)')

// Something like "2.*" or "1.2.x".
// Note that "x.x" is a valid xRange identifier, meaning "any version"
// Only the first item is strictly required.
createToken('XRANGEIDENTIFIERLOOSE', `${src[t.NUMERICIDENTIFIERLOOSE]}|x|X|\\*`)
createToken('XRANGEIDENTIFIER', `${src[t.NUMERICIDENTIFIER]}|x|X|\\*`)

createToken('XRANGEPLAIN', `[v=\\s]*(${src[t.XRANGEIDENTIFIER]})` +
                   `(?:\\.(${src[t.XRANGEIDENTIFIER]})` +
                   `(?:\\.(${src[t.XRANGEIDENTIFIER]})` +
                   `(?:${src[t.PRERELEASE]})?${
                     src[t.BUILD]}?` +
                   `)?)?`)

createToken('XRANGEPLAINLOOSE', `[v=\\s]*(${src[t.XRANGEIDENTIFIERLOOSE]})` +
                        `(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})` +
                        `(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})` +
                        `(?:${src[t.PRERELEASELOOSE]})?${
                          src[t.BUILD]}?` +
                        `)?)?`)

createToken('XRANGE', `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAIN]}$`)
createToken('XRANGELOOSE', `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAINLOOSE]}$`)

// Coercion.
// Extract anything that could conceivably be a part of a valid semver
createToken('COERCEPLAIN', `${'(^|[^\\d])' +
              '(\\d{1,'}${MAX_SAFE_COMPONENT_LENGTH}})` +
              `(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?` +
              `(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?`)
createToken('COERCE', `${src[t.COERCEPLAIN]}(?:$|[^\\d])`)
createToken('COERCEFULL', src[t.COERCEPLAIN] +
              `(?:${src[t.PRERELEASE]})?` +
              `(?:${src[t.BUILD]})?` +
              `(?:$|[^\\d])`)
createToken('COERCERTL', src[t.COERCE], true)
createToken('COERCERTLFULL', src[t.COERCEFULL], true)

// Tilde ranges.
// Meaning is "reasonably at or greater than"
createToken('LONETILDE', '(?:~>?)')

createToken('TILDETRIM', `(\\s*)${src[t.LONETILDE]}\\s+`, true)
exports.tildeTrimReplace = '$1~'

createToken('TILDE', `^${src[t.LONETILDE]}${src[t.XRANGEPLAIN]}$`)
createToken('TILDELOOSE', `^${src[t.LONETILDE]}${src[t.XRANGEPLAINLOOSE]}$`)

// Caret ranges.
// Meaning is "at least and backwards compatible with"
createToken('LONECARET', '(?:\\^)')

createToken('CARETTRIM', `(\\s*)${src[t.LONECARET]}\\s+`, true)
exports.caretTrimReplace = '$1^'

createToken('CARET', `^${src[t.LONECARET]}${src[t.XRANGEPLAIN]}$`)
createToken('CARETLOOSE', `^${src[t.LONECARET]}${src[t.XRANGEPLAINLOOSE]}$`)

// A simple gt/lt/eq thing, or just "" to indicate "any version"
createToken('COMPARATORLOOSE', `^${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]})$|^$`)
createToken('COMPARATOR', `^${src[t.GTLT]}\\s*(${src[t.FULLPLAIN]})$|^$`)

// An expression to strip any whitespace between the gtlt and the thing
// it modifies, so that `> 1.2.3` ==> `>1.2.3`
createToken('COMPARATORTRIM', `(\\s*)${src[t.GTLT]
}\\s*(${src[t.LOOSEPLAIN]}|${src[t.XRANGEPLAIN]})`, true)
exports.comparatorTrimReplace = '$1$2$3'

// Something like `1.2.3 - 1.2.4`
// Note that these all use the loose form, because they'll be
// checked against either the strict or loose comparator form
// later.
createToken('HYPHENRANGE', `^\\s*(${src[t.XRANGEPLAIN]})` +
                   `\\s+-\\s+` +
                   `(${src[t.XRANGEPLAIN]})` +
                   `\\s*$`)

createToken('HYPHENRANGELOOSE', `^\\s*(${src[t.XRANGEPLAINLOOSE]})` +
                        `\\s+-\\s+` +
                        `(${src[t.XRANGEPLAINLOOSE]})` +
                        `\\s*$`)

// Star ranges basically just allow anything at all.
createToken('STAR', '(<|>)?=?\\s*\\*')
// >=0.0.0 is like a star
createToken('GTE0', '^\\s*>=\\s*0\\.0\\.0\\s*$')
createToken('GTE0PRE', '^\\s*>=\\s*0\\.0\\.0-0\\s*$')


/***/ }),

/***/ 737:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

// @ts-check


// Reproduce safeRe[COMPARATORTRIM] replacement boundaries, not version
// validation. Each end-index finder returns an exclusive end, or its start
// on no match.
// Positions count from zero. An end of 3 means characters 0, 1, and 2 were read;
// range.slice(start, end) gives the matched text, not a converted number.
const {
  MAX_LENGTH,
  MAX_SAFE_BUILD_LENGTH,
  WHITESPACE_CHARACTERS,
} = __nccwpck_require__(101)

/**
 * Remembers the last two rows of digits so their characters need not be reread.
 * Positions start at -1 until a row has been found.
 *
 * @typedef {object} DigitRunCache
 * @property {number} start The first character of the most recently found row.
 * @property {number} end The position after that row's last character.
 * @property {number} previousStart The first character of the previous row.
 * @property {number} previousEnd The position after the previous row.
 */

// One entry per UTF-16 code unit keeps membership checks constant-time.
const whitespace = new Uint8Array(0x10000)
for (const char of WHITESPACE_CHARACTERS) {
  whitespace[char.charCodeAt(0)] = 1
}

/**
 * Checks whether a character is whitespace, like a space, tab, or newline.
 * Looking past the end of the string returns false.
 *
 * @param {string|undefined} char One character, or undefined past the string's end.
 * @returns {boolean} Whether the character is whitespace.
 * @example isWhitespace(' ') // true
 * @example isWhitespace('1') // false
 */
const isWhitespace = char =>
  char !== undefined && whitespace[char.charCodeAt(0)] === 1

/**
 * Checks for v, =, or whitespace before the version number.
 * These are historical version prefixes, not range operators:
 * < and > are handled separately, as are tilde and caret ranges.
 *
 * @param {string|undefined} char One character to check.
 * @returns {boolean} Whether the character can belong to a version prefix.
 * @example isVersionPrefix('=') // true
 * @example isVersionPrefix('>') // false
 */
const isVersionPrefix = char =>
  char === 'v' ||
  char === '=' ||
  isWhitespace(char)

/**
 * Checks whether a character is one of the digits 0 through 9.
 *
 * @param {string|undefined} char One character to check.
 * @returns {boolean} Whether the character is an ASCII digit.
 * @example isDigit('7') // true
 * @example isDigit('.') // false
 */
const isDigit = char => char !== undefined && char >= '0' && char <= '9'

/**
 * Checks whether a character is an English letter, uppercase or lowercase.
 *
 * @param {string|undefined} char One character to check.
 * @returns {boolean} Whether the character is an ASCII letter.
 * @example isLetter('b') // true
 * @example isLetter('7') // false
 */
const isLetter = char =>
  char !== undefined && (
    (char >= 'a' && char <= 'z') ||
    (char >= 'A' && char <= 'Z')
  )

/**
 * Checks for a letter, digit, or hyphen: the characters allowed inside
 * prerelease and build names such as beta-1.
 *
 * @param {string|undefined} char One character to check.
 * @returns {boolean} Whether the character can be part of an identifier.
 * @example isIdentifierCharacter('-') // true
 * @example isIdentifierCharacter('.') // false; dots separate identifiers
 */
const isIdentifierCharacter = char => isDigit(char) || isLetter(char) || char === '-'

/**
 * Checks whether a version component can begin here: with a digit or
 * a wildcard such as x, X, or *.
 *
 * @param {string|undefined} char One character to check.
 * @returns {boolean} Whether a number or wildcard can start with this character.
 * @example isVersionStart('x') // true
 * @example isVersionStart('v') // false; v belongs to the prefix
 */
const isVersionStart = char =>
  isDigit(char) ||
  char === 'x' ||
  char === 'X' ||
  char === '*'

/**
 * Finds the end of a row of digits, but returns no more than limit digits.
 * Remembers the last two rows so looking at them again does not reread them.
 *
 * @param {string} range The text to read; it is not changed.
 * @param {number} start The position of the first character to check.
 * @param {number} limit The most digit characters the returned match can include.
 * @param {DigitRunCache} digitRuns Shared cache of digit-run positions, updated in place.
 * @returns {number} The position after the matched digits, or start if none match.
 * @example findDigitsEndIndex('123abc', 0, 10, digitRuns) // 3, pointing at a
 * @example findDigitsEndIndex('123abc', 0, 2, digitRuns) // 2, pointing at the unread 3
 */
const findDigitsEndIndex = (range, start, limit, digitRuns) => {
  if (!isDigit(range[start])) {
    return start
  }
  if (start >= digitRuns.start && start < digitRuns.end) {
    return Math.min(start + limit, digitRuns.end)
  }
  if (start >= digitRuns.previousStart && start < digitRuns.previousEnd) {
    return Math.min(start + limit, digitRuns.previousEnd)
  }
  let end = start + 1
  while (isDigit(range[end])) {
    end++
  }
  // A failed full version can rewind from its second run to its first.
  digitRuns.previousStart = digitRuns.start
  digitRuns.previousEnd = digitRuns.end
  digitRuns.start = start
  digitRuns.end = end
  return Math.min(start + limit, end)
}

/**
 * Reads a number using the old regex's length and leading-zero rules.
 * Strict mode reads just the first zero in 012; loose mode can read all three.
 *
 * @param {string} range The text to read; it is not changed.
 * @param {number} start The position where the number should begin.
 * @param {boolean} loose Whether to allow leading zeros.
 * @param {DigitRunCache} digitRuns Shared digit-run cache, updated as needed.
 * @returns {number} The position after the matched digits, not their numeric value.
 * @example findVersionNumberEndIndex('012', 0, false, digitRuns) // 1
 * @example findVersionNumberEndIndex('012', 0, true, digitRuns) // 3
 */
const findVersionNumberEndIndex = (range, start, loose, digitRuns) => {
  if (!loose && range[start] === '0') {
    return start + 1
  }
  // Strict syntax allows an initial nonzero digit plus MAX_LENGTH digits.
  return findDigitsEndIndex(range, start, loose ? MAX_LENGTH : MAX_LENGTH + 1, digitRuns)
}

/**
 * Reads one piece of a prerelease name, such as beta or 1 in beta.1.
 * Tries the letter-or-hyphen form first, then the number-only form.
 *
 * @param {string} range The text to read; it is not changed.
 * @param {number} start The position where the identifier should begin.
 * @param {boolean} loose Whether numeric identifiers may have leading zeros.
 * @param {DigitRunCache} digitRuns Shared digit-run cache, updated as needed.
 * @returns {number} The position after the identifier, or start if none matches.
 * @example findPrereleaseIdentifierEndIndex('beta.1', 0, false, digitRuns) // 4, at the dot
 * @example findPrereleaseIdentifierEndIndex('001beta', 0, false, digitRuns) // 7
 */
const findPrereleaseIdentifierEndIndex = (range, start, loose, digitRuns) => {
  const digitsEnd = findDigitsEndIndex(range, start, MAX_LENGTH, digitRuns)
  // The legacy regex tries a nonnumeric identifier before a numeric one.
  if (isLetter(range[digitsEnd]) || range[digitsEnd] === '-') {
    let end = digitsEnd + 1
    const limit = end + MAX_SAFE_BUILD_LENGTH
    while (end < limit && isIdentifierCharacter(range[end])) {
      end++
    }
    return end
  }
  return findVersionNumberEndIndex(range, start, loose, digitRuns)
}

/**
 * Reads a prerelease suffix such as -beta.1, one dot-separated piece at a time.
 * Loose mode also allows the name without its opening hyphen.
 *
 * @param {string} range The text to read; it is not changed.
 * @param {number} start The position where the suffix should begin, including -.
 * @param {boolean} loose Whether the opening hyphen is optional and zeros allowed.
 * @param {DigitRunCache} digitRuns Shared digit-run cache, updated as needed.
 * @returns {number} The position after the matched suffix, or start if absent.
 * @example findPrereleaseEndIndex('-beta.1+sha', 0, false, digitRuns) // 7, at the plus
 * @example findPrereleaseEndIndex('beta', 0, false, digitRuns) // 0; no opening hyphen
 */
const findPrereleaseEndIndex = (range, start, loose, digitRuns) => {
  const hyphen = range[start] === '-'
  if (!loose && !hyphen) {
    return start
  }
  const identifierStart = start + (hyphen ? 1 : 0)
  let end = findPrereleaseIdentifierEndIndex(range, identifierStart, loose, digitRuns)
  if (end === identifierStart) {
    if (!loose || !hyphen) {
      return start
    }
    // In loose syntax, a lone hyphen can itself be the identifier.
    end = findPrereleaseIdentifierEndIndex(range, start, loose, digitRuns)
  }
  while (range[end] === '.') {
    const next = findPrereleaseIdentifierEndIndex(range, end + 1, loose, digitRuns)
    if (next === end + 1) {
      break
    }
    end = next
  }
  return end
}

/**
 * Reads one build-name piece, such as sha or 123 in +sha.123.
 * Stops at a disallowed character or the old regex's length limit.
 *
 * @param {string} range The text to read; it is not changed.
 * @param {number} start The position where the identifier should begin.
 * @returns {number} The position after the identifier, or start if none matches.
 * @example findBuildIdentifierEndIndex('sha.123', 0) // 3, at the dot
 * @example findBuildIdentifierEndIndex('001', 0) // 3; leading zeros are allowed
 */
const findBuildIdentifierEndIndex = (range, start) => {
  let end = start
  while (end - start < MAX_SAFE_BUILD_LENGTH && isIdentifierCharacter(range[end])) {
    end++
  }
  return end
}

/**
 * Reads optional build metadata such as +sha.123.
 * Leaves the position unchanged if there is no plus sign followed by a name.
 *
 * @param {string} range The text to read; it is not changed.
 * @param {number} start The position where the opening + should be.
 * @returns {number} The position after the matched metadata, or start if absent.
 * @example findBuildEndIndex('+sha.123 <2', 0) // 8, at the space
 * @example findBuildEndIndex('+', 0) // 0; a plus sign alone is not a match
 */
const findBuildEndIndex = (range, start) => {
  if (range[start] !== '+') {
    return start
  }
  let end = findBuildIdentifierEndIndex(range, start + 1)
  if (end === start + 1) {
    return start
  }
  while (range[end] === '.') {
    const next = findBuildIdentifierEndIndex(range, end + 1)
    if (next === end + 1) {
      break
    }
    end = next
  }
  return end
}

/**
 * Reads three numbers separated by dots, then any prerelease and build suffixes.
 * Uses loose rules, so forms such as 01.02.03beta can match here.
 *
 * @param {string} range The text to read; it is not changed.
 * @param {number} start The position of the first number, after any prefix.
 * @param {DigitRunCache} digitRuns Shared digit-run cache, updated as needed.
 * @returns {number} The position after the version match, or start if none matches.
 * @example findLooseFullVersionEndIndex('1.2.3-beta+sha <2', 0, digitRuns) // 14
 * @example findLooseFullVersionEndIndex('1.2', 0, digitRuns) // 0; needs three numbers
 */
const findLooseFullVersionEndIndex = (range, start, digitRuns) => {
  let end = start
  for (let component = 0; component < 3; component++) {
    const next = findVersionNumberEndIndex(range, end, true, digitRuns)
    if (next === end) {
      return start
    }
    end = next
    if (component < 2) {
      if (range[end] !== '.') {
        return start
      }
      end++
    }
  }
  const prereleaseEnd = findPrereleaseEndIndex(range, end, true, digitRuns)
  return findBuildEndIndex(range, prereleaseEnd)
}

/**
 * Reads one component of a partial or wildcard version, such as 2 or x in 2.x.
 * Numbers use strict leading-zero rules; wildcards take up one character.
 *
 * @param {string} range The text to read; it is not changed.
 * @param {number} start The position where the component should begin.
 * @param {DigitRunCache} digitRuns Shared digit-run cache, updated as needed.
 * @returns {number} The position after the component, or start if none matches.
 * @example findPartialVersionComponentEndIndex('2.x', 0, digitRuns) // 1, at the dot
 * @example findPartialVersionComponentEndIndex('2.x', 2, digitRuns) // 3, after x
 */
const findPartialVersionComponentEndIndex = (range, start, digitRuns) => {
  if (isDigit(range[start])) {
    return findVersionNumberEndIndex(range, start, false, digitRuns)
  }
  return isVersionStart(range[start]) ? start + 1 : start
}

/**
 * Reads up to three components, allowing forms such as 1, 1.2, or 1.x.
 * After the third component, also reads any strict prerelease and build suffixes.
 *
 * @param {string} range The text to read; it is not changed.
 * @param {number} start The position of a number or wildcard, after any prefix.
 * @param {DigitRunCache} digitRuns Shared digit-run cache, updated as needed.
 * @returns {number} The position after the matched version text.
 * @example findPartialVersionEndIndex('1.x <2', 0, digitRuns) // 3, at the space
 * @example findPartialVersionEndIndex('1.', 0, digitRuns) // 1; the trailing dot is unread
 */
const findPartialVersionEndIndex = (range, start, digitRuns) => {
  let end = findPartialVersionComponentEndIndex(range, start, digitRuns)
  for (let component = 0; component < 2; component++) {
    if (range[end] !== '.') {
      return end
    }
    const next = findPartialVersionComponentEndIndex(range, end + 1, digitRuns)
    if (next === end + 1) {
      return end
    }
    end = next
  }
  const prereleaseEnd = findPrereleaseEndIndex(range, end, false, digitRuns)
  return findBuildEndIndex(range, prereleaseEnd)
}

/**
 * Finds where a version match ends, without deciding whether the range is valid.
 * Tries a loose full version first, then a partial or wildcard version, just
 * like the old regex's LOOSEPLAIN and XRANGEPLAIN alternatives.
 *
 * @param {string} range The text to read; it is not changed.
 * @param {number} start The position of a number or wildcard, after any prefix.
 * @param {DigitRunCache} digitRuns Shared digit-run cache, updated as needed.
 * @returns {number} The position where scanning the next candidate can resume.
 * @example findVersionEndIndex('1.2.3 <2', 0, digitRuns) // 5, at the space
 * @example findVersionEndIndex('1.x <2', 0, digitRuns) // 3, at the space
 */
const findVersionEndIndex = (range, start, digitRuns) => {
  const fullVersionEnd = findLooseFullVersionEndIndex(range, start, digitRuns)
  return fullVersionEnd !== start
    ? fullVersionEnd
    : findPartialVersionEndIndex(range, start, digitRuns)
}

/**
 * Finds the one whitespace character the old replacement would remove.
 * Keeps leading whitespace, skips an optional operator, and checks immediately
 * after it. Returns -1 if there is nothing to remove.
 *
 * @param {string} range The text containing a candidate already found by the caller.
 * @param {number} matchStart The candidate's position, including leading whitespace.
 * @returns {number} The position of the removable whitespace, or -1 if absent.
 * @example findRemovableWhitespaceIndex(' > 1', 0) // 2; keep the space at position 0
 * @example findRemovableWhitespaceIndex('>1', 0) // -1
 */
const findRemovableWhitespaceIndex = (range, matchStart) => {
  let position = matchStart
  if (isWhitespace(range[position])) {
    position++
  }
  if (range[position] === '<' || range[position] === '>') {
    position++
  }
  if (range[position] === '=') {
    position++
  }
  return isWhitespace(range[position]) ? position : -1
}

/**
 * Joins an operator to its version, turning > 1.2.3 into >1.2.3.
 * Copies everything else according to the old regex's matching rules.
 * Moves forward through prefixes and whole versions to avoid repeatedly
 * searching the same characters on long inputs.
 *
 * @param {string} range The range text to process; the original string is unchanged.
 * @returns {string} The range with matched operator whitespace removed.
 * @example trimComparatorWhitespace('> 1.2.3 < 2') // '>1.2.3 <2'
 * @example trimComparatorWhitespace('> invalid') // '> invalid'
 */
const trimComparatorWhitespace = range => {
  let result = ''
  let copyFrom = 0
  let cursor = 0
  const digitRuns = { start: -1, end: -1, previousStart: -1, previousEnd: -1 }

  while (cursor < range.length) {
    const matchStart = cursor
    if (range[cursor] === '<' || range[cursor] === '>') {
      cursor++
    } else if (!isVersionPrefix(range[cursor]) && !isVersionStart(range[cursor])) {
      cursor++
      continue
    }

    // Consume a v/=/whitespace run once, even when no version follows it.
    while (cursor < range.length && isVersionPrefix(range[cursor])) {
      cursor++
    }
    if (!isVersionStart(range[cursor])) {
      continue
    }

    const whitespacePosition = findRemovableWhitespaceIndex(range, matchStart)
    if (whitespacePosition !== -1) {
      result += range.slice(copyFrom, whitespacePosition)
      copyFrom = whitespacePosition + 1
    }

    // Skip the entire match, so a prerelease's trailing v cannot be
    // reconsidered as the prefix of another version.
    cursor = findVersionEndIndex(range, cursor, digitRuns)
  }

  return result + range.slice(copyFrom)
}

module.exports = trimComparatorWhitespace


/***/ }),

/***/ 276:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



// Determine if version is greater than all the versions possible in the range.
const outside = __nccwpck_require__(280)
const gtr = (version, range, options) => outside(version, range, '>', options)
module.exports = gtr


/***/ }),

/***/ 465:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const Range = __nccwpck_require__(782)
const intersects = (r1, r2, options) => {
  r1 = new Range(r1, options)
  r2 = new Range(r2, options)
  return r1.intersects(r2, options)
}
module.exports = intersects


/***/ }),

/***/ 213:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const outside = __nccwpck_require__(280)
// Determine if version is less than all the versions possible in the range
const ltr = (version, range, options) => outside(version, range, '<', options)
module.exports = ltr


/***/ }),

/***/ 193:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const SemVer = __nccwpck_require__(163)
const Range = __nccwpck_require__(782)

const maxSatisfying = (versions, range, options) => {
  let max = null
  let maxSV = null
  let rangeObj = null
  try {
    rangeObj = new Range(range, options)
  } catch (er) {
    return null
  }
  versions.forEach((v) => {
    if (rangeObj.test(v)) {
      // satisfies(v, range, options)
      if (!max || maxSV.compare(v) === -1) {
        // compare(max, v, true)
        max = v
        maxSV = new SemVer(max, options)
      }
    }
  })
  return max
}
module.exports = maxSatisfying


/***/ }),

/***/ 595:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const SemVer = __nccwpck_require__(163)
const Range = __nccwpck_require__(782)
const minSatisfying = (versions, range, options) => {
  let min = null
  let minSV = null
  let rangeObj = null
  try {
    rangeObj = new Range(range, options)
  } catch (er) {
    return null
  }
  versions.forEach((v) => {
    if (rangeObj.test(v)) {
      // satisfies(v, range, options)
      if (!min || minSV.compare(v) === 1) {
        // compare(min, v, true)
        min = v
        minSV = new SemVer(min, options)
      }
    }
  })
  return min
}
module.exports = minSatisfying


/***/ }),

/***/ 866:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const SemVer = __nccwpck_require__(163)
const Range = __nccwpck_require__(782)
const gt = __nccwpck_require__(599)

const minVersion = (range, loose) => {
  range = new Range(range, loose)

  let minver = new SemVer('0.0.0')
  if (range.test(minver)) {
    return minver
  }

  minver = new SemVer('0.0.0-0')
  if (range.test(minver)) {
    return minver
  }

  minver = null
  for (let i = 0; i < range.set.length; ++i) {
    const comparators = range.set[i]

    let setMin = null
    comparators.forEach((comparator) => {
      // Clone to avoid manipulating the comparator's semver object.
      const compver = new SemVer(comparator.semver.version)
      switch (comparator.operator) {
        case '>':
          if (compver.prerelease.length === 0) {
            compver.patch++
          } else {
            compver.prerelease.push(0)
          }
          compver.raw = compver.format()
          /* fallthrough */
        case '':
        case '>=':
          if (!setMin || gt(compver, setMin)) {
            setMin = compver
          }
          break
        case '<':
        case '<=':
          /* Ignore maximum versions */
          break
        /* istanbul ignore next */
        default:
          throw new Error(`Unexpected operation: ${comparator.operator}`)
      }
    })
    if (setMin && (!minver || gt(minver, setMin))) {
      minver = setMin
    }
  }

  if (minver && range.test(minver)) {
    return minver
  }

  return null
}
module.exports = minVersion


/***/ }),

/***/ 280:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const SemVer = __nccwpck_require__(163)
const Comparator = __nccwpck_require__(379)
const { ANY } = Comparator
const Range = __nccwpck_require__(782)
const satisfies = __nccwpck_require__(11)
const gt = __nccwpck_require__(599)
const lt = __nccwpck_require__(491)
const lte = __nccwpck_require__(717)
const gte = __nccwpck_require__(236)

const outside = (version, range, hilo, options) => {
  version = new SemVer(version, options)
  range = new Range(range, options)

  let gtfn, ltefn, ltfn, comp, ecomp
  switch (hilo) {
    case '>':
      gtfn = gt
      ltefn = lte
      ltfn = lt
      comp = '>'
      ecomp = '>='
      break
    case '<':
      gtfn = lt
      ltefn = gte
      ltfn = gt
      comp = '<'
      ecomp = '<='
      break
    default:
      throw new TypeError('Must provide a hilo val of "<" or ">"')
  }

  // If it satisfies the range it is not outside
  if (satisfies(version, range, options)) {
    return false
  }

  // From now on, variable terms are as if we're in "gtr" mode.
  // but note that everything is flipped for the "ltr" function.

  for (let i = 0; i < range.set.length; ++i) {
    const comparators = range.set[i]

    let high = null
    let low = null

    comparators.forEach((comparator) => {
      if (comparator.semver === ANY) {
        comparator = new Comparator('>=0.0.0')
      }
      high = high || comparator
      low = low || comparator
      if (gtfn(comparator.semver, high.semver, options)) {
        high = comparator
      } else if (ltfn(comparator.semver, low.semver, options)) {
        low = comparator
      }
    })

    // If the edge version comparator has a operator then our version
    // isn't outside it
    if (high.operator === comp || high.operator === ecomp) {
      return false
    }

    // If the lowest version comparator has an operator and our version
    // is less than it then it isn't higher than the range
    if ((!low.operator || low.operator === comp) &&
        ltefn(version, low.semver)) {
      return false
    } else if (low.operator === ecomp && ltfn(version, low.semver)) {
      return false
    }
  }
  return true
}

module.exports = outside


/***/ }),

/***/ 28:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



// given a set of versions and a range, create a "simplified" range
// that includes the same versions that the original range does
// If the original range is shorter than the simplified one, return that.
const satisfies = __nccwpck_require__(11)
const compare = __nccwpck_require__(469)
module.exports = (versions, range, options) => {
  const set = []
  let first = null
  let prev = null
  const v = versions.sort((a, b) => compare(a, b, options))
  for (const version of v) {
    const included = satisfies(version, range, options)
    if (included) {
      prev = version
      if (!first) {
        first = version
      }
    } else {
      if (prev) {
        set.push([first, prev])
      }
      prev = null
      first = null
    }
  }
  if (first) {
    set.push([first, null])
  }

  const ranges = []
  for (const [min, max] of set) {
    if (min === max) {
      ranges.push(min)
    } else if (!max && min === v[0]) {
      ranges.push('*')
    } else if (!max) {
      ranges.push(`>=${min}`)
    } else if (min === v[0]) {
      ranges.push(`<=${max}`)
    } else {
      ranges.push(`${min} - ${max}`)
    }
  }
  const simplified = ranges.join(' || ')
  const original = typeof range.raw === 'string' ? range.raw : String(range)
  return simplified.length < original.length ? simplified : range
}


/***/ }),

/***/ 489:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const Range = __nccwpck_require__(782)
const Comparator = __nccwpck_require__(379)
const { ANY } = Comparator
const satisfies = __nccwpck_require__(11)
const compare = __nccwpck_require__(469)

// Complex range `r1 || r2 || ...` is a subset of `R1 || R2 || ...` iff:
// - Every simple range `r1, r2, ...` is a null set, OR
// - Every simple range `r1, r2, ...` which is not a null set is a subset of
//   some `R1, R2, ...`
//
// Simple range `c1 c2 ...` is a subset of simple range `C1 C2 ...` iff:
// - If c is only the ANY comparator
//   - If C is only the ANY comparator, return true
//   - Else if in prerelease mode, return false
//   - else replace c with `[>=0.0.0]`
// - If C is only the ANY comparator
//   - if in prerelease mode, return true
//   - else replace C with `[>=0.0.0]`
// - Let EQ be the set of = comparators in c
// - If EQ is more than one, return true (null set)
// - Let GT be the highest > or >= comparator in c
// - Let LT be the lowest < or <= comparator in c
// - If GT and LT, and GT.semver > LT.semver, return true (null set)
// - If any C is a = range, and GT or LT are set, return false
// - If EQ
//   - If GT, and EQ does not satisfy GT, return true (null set)
//   - If LT, and EQ does not satisfy LT, return true (null set)
//   - If EQ satisfies every C, return true
//   - Else return false
// - If GT
//   - If GT.semver is lower than any > or >= comp in C, return false
//   - If GT is >=, and GT.semver does not satisfy every C, return false
//   - If GT.semver has a prerelease, and not in prerelease mode
//     - If no C has a prerelease and the GT.semver tuple, return false
// - If LT
//   - If LT.semver is greater than any < or <= comp in C, return false
//   - If LT is <=, and LT.semver does not satisfy every C, return false
//   - If LT.semver has a prerelease, and not in prerelease mode
//     - If no C has a prerelease and the LT.semver tuple, return false
// - Else return true

const subset = (sub, dom, options = {}) => {
  if (sub === dom) {
    return true
  }

  sub = new Range(sub, options)
  dom = new Range(dom, options)
  let sawNonNull = false

  OUTER: for (const simpleSub of sub.set) {
    for (const simpleDom of dom.set) {
      const isSub = simpleSubset(simpleSub, simpleDom, options)
      sawNonNull = sawNonNull || isSub !== null
      if (isSub) {
        continue OUTER
      }
    }
    // the null set is a subset of everything, but null simple ranges in
    // a complex range should be ignored.  so if we saw a non-null range,
    // then we know this isn't a subset, but if EVERY simple range was null,
    // then it is a subset.
    if (sawNonNull) {
      return false
    }
  }
  return true
}

const minimumVersionWithPreRelease = [new Comparator('>=0.0.0-0')]
const minimumVersion = [new Comparator('>=0.0.0')]

const simpleSubset = (sub, dom, options) => {
  if (sub === dom) {
    return true
  }

  if (sub.length === 1 && sub[0].semver === ANY) {
    if (dom.length === 1 && dom[0].semver === ANY) {
      return true
    } else if (options.includePrerelease) {
      sub = minimumVersionWithPreRelease
    } else {
      sub = minimumVersion
    }
  }

  if (dom.length === 1 && dom[0].semver === ANY) {
    if (options.includePrerelease) {
      return true
    } else {
      dom = minimumVersion
    }
  }

  const eqSet = new Set()
  let gt, lt
  for (const c of sub) {
    if (c.operator === '>' || c.operator === '>=') {
      gt = higherGT(gt, c, options)
    } else if (c.operator === '<' || c.operator === '<=') {
      lt = lowerLT(lt, c, options)
    } else {
      eqSet.add(c.semver)
    }
  }

  if (eqSet.size > 1) {
    return null
  }

  let gtltComp
  if (gt && lt) {
    gtltComp = compare(gt.semver, lt.semver, options)
    if (gtltComp > 0) {
      return null
    } else if (gtltComp === 0 && (gt.operator !== '>=' || lt.operator !== '<=')) {
      return null
    }
  }

  // will iterate one or zero times
  for (const eq of eqSet) {
    if (gt && !satisfies(eq, String(gt), options)) {
      return null
    }

    if (lt && !satisfies(eq, String(lt), options)) {
      return null
    }

    for (const c of dom) {
      if (!satisfies(eq, String(c), options)) {
        return false
      }
    }

    return true
  }

  let higher, lower
  let hasDomLT, hasDomGT
  // if the subset has a prerelease, we need a comparator in the superset
  // with the same tuple and a prerelease, or it's not a subset
  let needDomLTPre = lt &&
    !options.includePrerelease &&
    lt.semver.prerelease.length ? lt.semver : false
  let needDomGTPre = gt &&
    !options.includePrerelease &&
    gt.semver.prerelease.length ? gt.semver : false
  // exception: <1.2.3-0 is the same as <1.2.3
  if (needDomLTPre && needDomLTPre.prerelease.length === 1 &&
      lt.operator === '<' && needDomLTPre.prerelease[0] === 0) {
    needDomLTPre = false
  }

  for (const c of dom) {
    hasDomGT = hasDomGT || c.operator === '>' || c.operator === '>='
    hasDomLT = hasDomLT || c.operator === '<' || c.operator === '<='
    if (gt) {
      if (needDomGTPre) {
        if (c.semver.prerelease && c.semver.prerelease.length &&
            c.semver.major === needDomGTPre.major &&
            c.semver.minor === needDomGTPre.minor &&
            c.semver.patch === needDomGTPre.patch) {
          needDomGTPre = false
        }
      }
      if (c.operator === '>' || c.operator === '>=') {
        higher = higherGT(gt, c, options)
        if (higher === c && higher !== gt) {
          return false
        }
      } else if (gt.operator === '>=' && !c.test(gt.semver)) {
        return false
      }
    }
    if (lt) {
      if (needDomLTPre) {
        if (c.semver.prerelease && c.semver.prerelease.length &&
            c.semver.major === needDomLTPre.major &&
            c.semver.minor === needDomLTPre.minor &&
            c.semver.patch === needDomLTPre.patch) {
          needDomLTPre = false
        }
      }
      if (c.operator === '<' || c.operator === '<=') {
        lower = lowerLT(lt, c, options)
        if (lower === c && lower !== lt) {
          return false
        }
      } else if (lt.operator === '<=' && !c.test(lt.semver)) {
        return false
      }
    }
    if (!c.operator && (lt || gt) && gtltComp !== 0) {
      return false
    }
  }

  // if there was a < or >, and nothing in the dom, then must be false
  // UNLESS it was limited by another range in the other direction.
  // Eg, >1.0.0 <1.0.1 is still a subset of <2.0.0
  if (gt && hasDomLT && !lt && gtltComp !== 0) {
    return false
  }

  if (lt && hasDomGT && !gt && gtltComp !== 0) {
    return false
  }

  // we needed a prerelease range in a specific tuple, but didn't get one
  // then this isn't a subset.  eg >=1.2.3-pre is not a subset of >=1.0.0,
  // because it includes prereleases in the 1.2.3 tuple
  if (needDomGTPre || needDomLTPre) {
    return false
  }

  return true
}

// >=1.2.3 is lower than >1.2.3
const higherGT = (a, b, options) => {
  if (!a) {
    return b
  }
  const comp = compare(a.semver, b.semver, options)
  return comp > 0 ? a
    : comp < 0 ? b
    : b.operator === '>' && a.operator === '>=' ? b
    : a
}

// <=1.2.3 is higher than <1.2.3
const lowerLT = (a, b, options) => {
  if (!a) {
    return b
  }
  const comp = compare(a.semver, b.semver, options)
  return comp < 0 ? a
    : comp > 0 ? b
    : b.operator === '<' && a.operator === '<=' ? b
    : a
}

module.exports = subset


/***/ }),

/***/ 750:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const Range = __nccwpck_require__(782)

// Mostly just for testing and legacy API reasons
const toComparators = (range, options) =>
  new Range(range, options).set
    .map(comp => comp.map(c => c.value).join(' ').trim().split(' '))

module.exports = toComparators


/***/ }),

/***/ 118:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const Range = __nccwpck_require__(782)
const validRange = (range, options) => {
  try {
    // Return '*' instead of '' so that truthiness works.
    // This will throw if it's invalid anyway
    return new Range(range, options).range || '*'
  } catch (er) {
    return null
  }
}
module.exports = validRange


/***/ })

/******/ });
/************************************************************************/
/******/ // The module cache
/******/ var __webpack_module_cache__ = {};
/******/ 
/******/ // The require function
/******/ function __nccwpck_require__(moduleId) {
/******/ 	// Check if module is in cache
/******/ 	var cachedModule = __webpack_module_cache__[moduleId];
/******/ 	if (cachedModule !== undefined) {
/******/ 		return cachedModule.exports;
/******/ 	}
/******/ 	// Create a new module (and put it into the cache)
/******/ 	var module = __webpack_module_cache__[moduleId] = {
/******/ 		// no module.id needed
/******/ 		// no module.loaded needed
/******/ 		exports: {}
/******/ 	};
/******/ 
/******/ 	// Execute the module function
/******/ 	var threw = true;
/******/ 	try {
/******/ 		__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 		threw = false;
/******/ 	} finally {
/******/ 		if(threw) delete __webpack_module_cache__[moduleId];
/******/ 	}
/******/ 
/******/ 	// Return the exports of the module
/******/ 	return module.exports;
/******/ }
/******/ 
/************************************************************************/
/******/ /* webpack/runtime/asset-relocator-loader */
/******/ if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = decodeURIComponent(new URL('.', import.meta.url).pathname).slice(import.meta.url.match(/^file:\/\/\/\w:/) ? 1 : 0, -1) + "/";
/******/ 
/************************************************************************/
var __webpack_exports__ = {};

;// CONCATENATED MODULE: external "node:fs"
const external_node_fs_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:fs");
;// CONCATENATED MODULE: external "node:path"
const external_node_path_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:path");
;// CONCATENATED MODULE: ./src/config.js
// The `vetra` section of powerhouse.config.json, as far as this action reads
// it (releases spec, section 3). Other keys there (connectPort, driveId,
// driveUrl, previewDrive) belong to `ph vetra` and are ignored.




const CONFIG_FILE = 'powerhouse.config.json';

/** Reactor and read-model migrations of a Powerhouse project. */
const DEFAULT_MIGRATIONS = [
  'processors/*/migrations.ts',
  'processors/*/migrations/**',
  'document-models/*/upgrades/**',
];

const HOST = /^[a-z][a-z0-9-]{0,63}$/;
const PRERELEASE_IDS = ['alpha', 'beta', 'rc'];
const SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
const REQUIRES_KEYS = ['powerhouse', 'services', 'size'];

const isPlainObject = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const isStringList = (x) => Array.isArray(x) && x.every((s) => typeof s === 'string' && s.trim() !== '');

function parseVetraConfig(vetra) {
  const out = {
    host: 'cli',
    packageDirs: ['.'],
    prerelease: {},
    requires: {},
    migrations: [...DEFAULT_MIGRATIONS],
    migrates: false,
  };
  if (vetra === undefined || vetra === null) return out;
  if (!isPlainObject(vetra)) throw new Error(`${CONFIG_FILE}: vetra must be an object`);
  const problems = [];
  const v = vetra;

  if (v.host !== undefined) {
    if (typeof v.host === 'string' && HOST.test(v.host)) out.host = v.host;
    else problems.push('vetra.host must be a lower-case host name such as "cli"');
  }
  if (v.packageDirs !== undefined) {
    if (isStringList(v.packageDirs)) out.packageDirs = [...v.packageDirs];
    else problems.push('vetra.packageDirs must be a list of directories ([] publishes no package)');
  }
  if (v.prerelease !== undefined) {
    if (!isPlainObject(v.prerelease)) {
      problems.push('vetra.prerelease must map branch names to alpha, beta or rc');
    } else {
      for (const [branch, id] of Object.entries(v.prerelease)) {
        if (PRERELEASE_IDS.includes(id)) out.prerelease[branch] = id;
        else problems.push(`vetra.prerelease.${branch} must be alpha, beta or rc (got ${JSON.stringify(id)})`);
      }
    }
  }
  if (v.requires !== undefined) {
    if (!isPlainObject(v.requires)) {
      problems.push('vetra.requires must be an object');
    } else {
      const r = v.requires;
      for (const k of Object.keys(r)) {
        if (!REQUIRES_KEYS.includes(k)) problems.push(`vetra.requires.${k} is not known (${REQUIRES_KEYS.join(', ')})`);
      }
      if (r.powerhouse !== undefined) {
        if (typeof r.powerhouse === 'string' && r.powerhouse.trim()) out.requires.powerhouse = r.powerhouse;
        else problems.push('vetra.requires.powerhouse must be a version range such as ">=6.2.3"');
      }
      if (r.services !== undefined) {
        if (isStringList(r.services)) out.requires.services = [...r.services];
        else problems.push('vetra.requires.services must be a list of service names');
      }
      if (r.size !== undefined) {
        if (SIZES.includes(r.size)) out.requires.size = r.size;
        else problems.push(`vetra.requires.size must be one of ${SIZES.join(', ')}`);
      }
    }
  }
  if (v.migrations !== undefined) {
    if (isStringList(v.migrations)) out.migrations = [...v.migrations];
    else problems.push('vetra.migrations must be a list of globs');
  }
  if (v.migrates !== undefined) {
    if (typeof v.migrates === 'boolean') out.migrates = v.migrates;
    else problems.push('vetra.migrates must be true or false');
  }
  if (problems.length) throw new Error(`${CONFIG_FILE}:\n- ${problems.join('\n- ')}`);
  return out;
}

function readVetraConfig(dir) {
  const file = external_node_path_namespaceObject.join(dir, CONFIG_FILE);
  if (!external_node_fs_namespaceObject.existsSync(file)) return parseVetraConfig(undefined);
  let json;
  try {
    json = JSON.parse(external_node_fs_namespaceObject.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`${CONFIG_FILE} is not valid JSON: ${err.message}`);
  }
  return parseVetraConfig(json?.vetra);
}

/** The host's Dockerfile relative to `dir`, or null when the project has none. */
function findHostDockerfile(dir, config) {
  const rel = `hosts/${config.host}/Dockerfile`;
  return fs.existsSync(path.join(dir, rel)) ? rel : null;
}

/** Publishing needs a host (spec 14.11): its Dockerfile, relative to `dir`. */
function hostDockerfile(dir, config) {
  const rel = findHostDockerfile(dir, config);
  if (rel === null) {
    const want = `hosts/${config.host}/Dockerfile`;
    throw new Error(
      `Publishing needs a host: ${want} is missing. Generate it with \`ph generate hosts\` ` +
        '(a Powerhouse version with uniform runners, FEATURE_UNIFORM_RUNNERS_ENABLED=1).',
    );
  }
  return rel;
}

;// CONCATENATED MODULE: ./src/inputs.js
// The action's inputs, and the state the prepare step hands to the finish
// step (action.yml passes prepare's outputs as VETRA_* variables).

function actionInputs(env = process.env) {
  const appId = env.INPUT_APP_ID;
  if (!appId) throw new Error("input 'app-id' is required");
  return {
    appId,
    vetraUrl: env.INPUT_VETRA_URL || 'https://switchboard.vetra.io',
    renownUrl: env.INPUT_RENOWN_URL || 'https://switchboard.renown.vetra.io',
    githubToken: env.INPUT_GITHUB_TOKEN || '',
  };
}

function stepState(env = process.env) {
  const need = (k) => {
    const v = env[k];
    if (!v) throw new Error(`${k} is missing: the prepare step did not finish`);
    return v;
  };
  return {
    kind: need('VETRA_KIND'),
    version: need('VETRA_VERSION'),
    notes: env.VETRA_NOTES ? env.VETRA_NOTES : null,
    releaseBranch: env.VETRA_RELEASE_BRANCH === 'true',
    production: env.VETRA_PRODUCTION === 'true',
    imageRef: need('VETRA_IMAGE_REF'),
    imageDigest: need('VETRA_IMAGE_DIGEST'),
    powerhouse: need('VETRA_POWERHOUSE'),
    baseImage: need('VETRA_BASE_IMAGE'),
  };
}

;// CONCATENATED MODULE: external "node:child_process"
const external_node_child_process_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:child_process");
;// CONCATENATED MODULE: external "node:crypto"
const external_node_crypto_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:crypto");
;// CONCATENATED MODULE: ./src/util.js
// Small process/IO helpers shared across the action's scripts. Kept thin and
// side-effecting on purpose (logging, env files, subprocess exec) — the pure
// decision logic lives in ref.js / version.js / rest.js / image.js.





/**
 * Runs a command synchronously and returns stdout. Throws (with stderr
 * attached) on a non-zero exit code. Never logs the resolved command's
 * environment, so callers must mask secrets themselves before/after calling.
 * @param {string} cmd
 * @param {string[]} args
 * @param {import('node:child_process').SpawnSyncOptions} [opts]
 */
function util_execCmd(cmd, args, opts = {}) {
  const res = (0,external_node_child_process_namespaceObject.spawnSync)(cmd, args, { encoding: 'utf8', ...opts });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    const stderr = res.stderr ? `\n${res.stderr}` : '';
    throw new Error(`'${cmd} ${args.join(' ')}' failed with exit code ${res.status}${stderr}`);
  }
  return res.stdout ?? '';
}

/** Masks a secret value in the workflow log. No-op for empty values. */
function mask(value) {
  if (!value) return;
  for (const line of String(value).split('\n')) {
    if (line) process.stdout.write(`::add-mask::${line}\n`);
  }
}

function notice(message) {
  process.stdout.write(`::notice::${message}\n`);
}

function warning(message) {
  process.stdout.write(`::warning::${message}\n`);
}

/** An error annotation that does not fail the step. */
function errorAnnotation(message) {
  process.stdout.write(`::error::${message}\n`);
}

/** Marks the step as failed without throwing (mirrors @actions/core.setFailed). */
function setFailed(message) {
  process.stdout.write(`::error::${message}\n`);
  process.exitCode = 1;
}

/**
 * Writes a `name=value` output in the multiline GITHUB_OUTPUT format. The
 * delimiter is random per call (values such as release notes come from
 * contributors' commit and PR titles): a value containing it is refused, so it
 * can never end the value early and forge another output.
 */
function setOutput(name, value, { uuid = external_node_crypto_namespaceObject.randomUUID } = {}) {
  const file = process.env.GITHUB_OUTPUT;
  const text = String(value ?? '');
  if (file) {
    const delimiter = `ghadelimiter_${uuid()}`;
    if (name.includes(delimiter) || text.includes(delimiter)) {
      throw new Error(`output '${name}' contains its delimiter ${delimiter}: not writing it`);
    }
    external_node_fs_namespaceObject.appendFileSync(file, `${name}<<${delimiter}\n${text}\n${delimiter}\n`);
  } else {
    // Fallback for local/manual runs without a GITHUB_OUTPUT file.
    process.stdout.write(`[output] ${name}=${text}\n`);
  }
}

/** Appends markdown to the job summary, if GITHUB_STEP_SUMMARY is set. */
function appendSummary(markdown) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) external_node_fs_namespaceObject.appendFileSync(file, markdown);
}

;// CONCATENATED MODULE: ./src/version.js
// Version rules of the releases spec (section 3), the same as Vetra's
// subgraphs/vetra-apps/releases/version.ts in vetra-cloud-package: keep the
// two in step. Every version is semver (no build metadata, no leading
// zeros); a release has no prerelease part or exactly alpha|beta|rc.<n>;
// anything else is a build.

const NUM = '(0|[1-9]\\d*)';
const IDENT = '(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)';
const SEMVER = new RegExp(`^${NUM}\\.${NUM}\\.${NUM}(?:-(${IDENT}(?:\\.${IDENT})*))?$`);
const RELEASE_PRE = /^(alpha|beta|rc)\.\d+$/;
const MAX_IDENT = 40;

function parseVersion(v) {
  const m = SEMVER.exec(String(v));
  if (!m) return null;
  const prerelease = m[4] ? m[4].split('.').map((p) => (/^\d+$/.test(p) ? Number(p) : p)) : [];
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), prerelease };
}

function versionKind(v) {
  const m = SEMVER.exec(String(v));
  if (!m) return null;
  return !m[4] || RELEASE_PRE.test(m[4]) ? 'release' : 'build';
}

function compareIdent(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'number') return -1;
  if (typeof b === 'number') return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Semver order of two releases; throws when either is a build. */
function compareReleases(a, b) {
  if (versionKind(a) !== 'release' || versionKind(b) !== 'release') {
    throw new Error(`compareReleases: ${a} or ${b} is a build, not a release`);
  }
  const x = parseVersion(a);
  const y = parseVersion(b);
  for (const k of ['major', 'minor', 'patch']) {
    if (x[k] !== y[k]) return x[k] - y[k];
  }
  if (!x.prerelease.length || !y.prerelease.length) return y.prerelease.length - x.prerelease.length;
  for (let i = 0; i < Math.max(x.prerelease.length, y.prerelease.length); i++) {
    if (x.prerelease[i] === undefined) return -1;
    if (y.prerelease[i] === undefined) return 1;
    const c = compareIdent(x.prerelease[i], y.prerelease[i]);
    if (c !== 0) return c;
  }
  return 0;
}

/**
 * A branch name as one semver prerelease identifier: only [0-9A-Za-z-], at
 * most 40 characters, never purely numeric, never alpha/beta/rc (which would
 * turn `1.4.0-rc.5` into a release).
 */
function branchIdent(branch) {
  let id = String(branch ?? '')
    .replace(/[^0-9A-Za-z-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAX_IDENT)
    .replace(/-$/, '');
  if (!id) id = 'branch';
  if (/^\d+$/.test(id)) id = `b${id}`;
  if (id === 'alpha' || id === 'beta' || id === 'rc') id = `branch-${id}`;
  return id.slice(0, MAX_IDENT);
}

/** The version of a build: `<proposed>-<branch>.<run>` (push) or `<proposed>-pr.<n>.<run>`. */
function buildVersion(proposed, { branch, pr, runNumber }) {
  if (!parseVersion(proposed)) throw new Error(`proposed version ${proposed} is not semver`);
  const run = String(runNumber);
  if (!/^[1-9]\d*$/.test(run)) throw new Error(`run number ${run} is not a positive integer`);
  const middle = pr != null ? `pr.${pr}` : branchIdent(branch);
  const v = `${proposed}-${middle}.${run}`;
  if (versionKind(v) !== 'build') throw new Error(`${v} is not a build version`);
  return v;
}

/**
 * What a branch proposes when release-please has nothing to release: one
 * step after its latest release (the next prerelease number, or the next
 * patch), or 0.1.0 for a project without releases.
 */
function nextAfter(latest, prereleaseId) {
  const p = latest ? parseVersion(latest) : null;
  if (!p) return prereleaseId ? `0.1.0-${prereleaseId}.0` : '0.1.0';
  const core = `${p.major}.${p.minor}.${p.patch}`;
  const [id, n] = p.prerelease;
  if (p.prerelease.length === 2 && RELEASE_PRE.test(`${id}.${n}`)) {
    return prereleaseId ? `${core}-${id}.${n + 1}` : core;
  }
  const patch = `${p.major}.${p.minor}.${p.patch + 1}`;
  return prereleaseId ? `${patch}-${prereleaseId}.0` : patch;
}

;// CONCATENATED MODULE: ./src/migrates.js
// `migrates` of a release (releases spec, section 3): the commits since the
// previous release add or change files matching vetra.migrations, or the
// config says vetra.migrates: true. Needs the full history (fetch-depth: 0).




function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') {
        re += '(?:.*/)?';
        i += 2;
      } else {
        re += '.*';
        i += 1;
      }
    } else if (c === '*') {
      re += '[^/]*';
    } else {
      re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`);
}

function touchesMigrations(files, globs) {
  const res = globs.map(globToRegExp);
  return files.some((f) => res.some((r) => r.test(f)));
}

/**
 * The release `version` migrates from: the highest earlier release tag in
 * HEAD^'s history, counting only full releases for a full release (2.0.0
 * migrates from 1.4.0, not from 2.0.0-beta.3).
 */
function previousRelease(version, exec = util_execCmd) {
  if (versionKind(version) !== 'release') throw new Error(`"${version}" is not a release version`);
  const full = parseVersion(version).prerelease.length === 0;
  if (exec('git', ['rev-parse', '--is-shallow-repository']).trim() === 'true') {
    throw new Error('vetra-publish needs the full git history: use actions/checkout with fetch-depth: 0');
  }
  try {
    exec('git', ['rev-parse', '--verify', '--quiet', 'HEAD^']);
  } catch {
    return null; // the first commit has no previous release
  }
  const tags = exec('git', ['tag', '--merged', 'HEAD^', '--list', 'v*']).split('\n').map((s) => s.trim()).filter(Boolean);
  const earlier = tags
    .map((t) => t.slice(1))
    .filter((v) => versionKind(v) === 'release')
    .filter((v) => !full || parseVersion(v).prerelease.length === 0)
    .filter((v) => compareReleases(v, version) < 0)
    .sort(compareReleases);
  return earlier.length ? `v${earlier.at(-1)}` : null;
}

function computeMigrates({ version, config }, exec = util_execCmd) {
  if (config.migrates) return true;
  const prev = previousRelease(version, exec);
  if (!prev) return false;
  const files = exec('git', ['diff', '--name-only', `${prev}..HEAD`]).split('\n').filter(Boolean);
  return touchesMigrations(files, config.migrations);
}

;// CONCATENATED MODULE: external "node:os"
const external_node_os_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:os");
// EXTERNAL MODULE: ./node_modules/semver/index.js
var semver = __nccwpck_require__(88);
;// CONCATENATED MODULE: ./src/publish.js
// Package publishing: a temp .npmrc scoped to one registry host, then
// `npm version` (local, no git tag), `pnpm pack` (so workspace:/catalog:
// protocols get resolved to real version ranges before packing), and
// `npm publish` of the resulting tarball.
//
// Only `npm publish` is given --userconfig: it is the step that authenticates.
// Packing never contacts a registry, and pnpm parses its own pack options
// strictly, rejecting --userconfig with "Unknown option".





/**
 * Picks the tarball filename out of `pnpm pack`'s stdout. pnpm prints the
 * absolute/relative tarball path as the last non-empty line.
 * @param {string} packOutput
 * @param {string} dir
 * @returns {string}
 */
function extractTarballName(packOutput, dir) {
  const lines = String(packOutput)
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const last = lines[lines.length - 1];
  if (!last || !last.endsWith('.tgz')) {
    throw new Error(`could not determine the tarball name from 'pnpm pack' output: ${JSON.stringify(packOutput)}`);
  }
  return external_node_path_namespaceObject.isAbsolute(last) ? last : external_node_path_namespaceObject.join(dir, last);
}

/**
 * Publishes one package directory at the given version/tag/registry.
 * Writes and removes a scratch .npmrc so the auth token never lands in the
 * repo's real .npmrc and is never printed.
 * @param {{ dir: string, version: string, registryUrl: string, distTag: string, token: string }} opts
 */
function publishPackage({ dir, version, registryUrl, distTag, token }, exec = execCmd) {
  const normalizedRegistry = registryUrl.replace(/\/+$/, '');
  const host = normalizedRegistry.replace(/^https?:\/\//, '');
  const npmrcPath = path.join(dir, '.npmrc.vetra-deploy-action');
  const npmrcContents = `//${host}/:_authToken=${token}\nregistry=${normalizedRegistry}/\n`;

  fs.writeFileSync(npmrcPath, npmrcContents, { mode: 0o600 });
  try {
    exec('npm', ['version', version, '--no-git-tag-version', '--allow-same-version'], { cwd: dir });

    // No --userconfig here: pack writes a tarball and never talks to a registry,
    // and pnpm rejects the flag outright.
    const packOutput = exec('pnpm', ['pack'], { cwd: dir });
    const tarball = extractTarballName(packOutput, dir);

    exec(
      'npm',
      ['publish', tarball, '--registry', normalizedRegistry, '--tag', distTag, '--userconfig', npmrcPath],
      { cwd: dir },
    );
  } finally {
    fs.rmSync(npmrcPath, { force: true });
  }
}

;// CONCATENATED MODULE: ./src/packages.js
// npm packages, published at the run's version (releases spec, section 3,
// step 4). package.json versions are stamped locally and never committed;
// pnpm pack resolves workspace:/catalog: ranges.









const PRODUCTION_REGISTRY = 'https://registry.vetra.io';
const DEV_REGISTRY = 'https://registry.dev.vetra.io';

/** Renown gives the production registry audience only to pushes on the production and release branches. */
function registryFor({ releaseBranch, event }) {
  return event === 'push' && releaseBranch ? PRODUCTION_REGISTRY : DEV_REGISTRY;
}

const RESERVED_TAGS = /^(latest|next|latest-\d+)$/;

/**
 * Releases: latest (production branch), latest-<major> (other release
 * branches: a 1.x patch must not move latest back), next (prereleases).
 * Builds: the branch or pr-<n>; a branch that would clash with those tags or
 * parse as a version range (npm refuses `1.x`) gets `branch-` in front.
 */
function distTagFor({ kind, version, branch, pr, production }) {
  if (kind === 'release') {
    const p = parseVersion(version);
    if (p.prerelease.length) return 'next';
    return production ? 'latest' : `latest-${p.major}`;
  }
  if (pr != null) return `pr-${pr}`;
  const tag = String(branch ?? '').replace(/[^0-9A-Za-z-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'branch';
  return RESERVED_TAGS.test(tag) || /^v?\d/.test(tag) || semver.validRange(tag) !== null ? `branch-${tag}` : tag;
}

function publishableDirs(dirs, warn) {
  const out = [];
  for (const dir of dirs) {
    const file = external_node_path_namespaceObject.join(dir, 'package.json');
    if (!external_node_fs_namespaceObject.existsSync(file)) {
      warn(`Vetra: no package.json in '${dir}': not publishing it.`);
      continue;
    }
    const pkg = JSON.parse(external_node_fs_namespaceObject.readFileSync(file, 'utf8'));
    if (pkg.private) {
      warn(`Vetra: '${dir}' (${pkg.name ?? 'unnamed'}) is private: not publishing it.`);
      continue;
    }
    if (!pkg.name) {
      warn(`Vetra: '${dir}' has no package name: not publishing it.`);
      continue;
    }
    out.push({ dir, name: pkg.name });
  }
  return out;
}

function publishPackages({ dirs, version, registryUrl, distTag, token }, exec = util_execCmd, log = console.log) {
  const registry = registryUrl.replace(/\/+$/, '');
  const published = [];
  for (const { dir, name } of dirs) {
    // The token file lives outside the package dir so that `pnpm pack` can never ship it.
    const scratch = external_node_fs_namespaceObject.mkdtempSync(external_node_path_namespaceObject.join(external_node_os_namespaceObject.tmpdir(), 'vetra-publish-'));
    const npmrc = external_node_path_namespaceObject.join(scratch, '.npmrc');
    external_node_fs_namespaceObject.writeFileSync(npmrc, `//${registry.replace(/^https?:\/\//, '')}/:_authToken=${token}\nregistry=${registry}/\n`, { mode: 0o600 });
    const pkgFile = external_node_path_namespaceObject.join(dir, 'package.json');
    const original = external_node_fs_namespaceObject.readFileSync(pkgFile, 'utf8');
    let tarball = null;
    try {
      let already = '';
      try {
        already = exec('npm', ['view', `${name}@${version}`, 'version', '--registry', registry, '--userconfig', npmrc], { cwd: dir }).trim();
      } catch (e) {
        if (!/E404/.test(String(e?.message ?? e))) throw e; // auth, network, 5xx: not "unpublished"
      }
      if (already === version) {
        log(`Vetra: ${name}@${version} is already in ${registry}; not publishing it again.`);
      } else {
        external_node_fs_namespaceObject.writeFileSync(pkgFile, `${JSON.stringify({ ...JSON.parse(original), version }, null, 2)}\n`);
        tarball = extractTarballName(exec('pnpm', ['pack'], { cwd: dir }), dir);
        exec('npm', ['publish', tarball, '--registry', registry, '--tag', distTag, '--userconfig', npmrc], { cwd: dir });
      }
      published.push({ name, version });
    } finally {
      external_node_fs_namespaceObject.writeFileSync(pkgFile, original);
      if (tarball) external_node_fs_namespaceObject.rmSync(tarball, { force: true });
      external_node_fs_namespaceObject.rmSync(scratch, { recursive: true, force: true });
    }
  }
  return published;
}

;// CONCATENATED MODULE: ./src/report.js
// POST ci/releases: the body exactly as vetra-cloud-package's
// parseReleaseBody (subgraphs/vetra-apps/ci.ts) reads it. Strict on the
// server: never send extra shapes or coerced types.

function pickRequires(requires) {
  const out = {};
  for (const k of ['powerhouse', 'services', 'size']) {
    if (requires?.[k] !== undefined) out[k] = requires[k];
  }
  return out;
}

function releaseBody(r) {
  const isPr = r.pr != null;
  return {
    appId: r.appId,
    version: r.version,
    kind: r.kind,
    branch: isPr ? null : (r.branch ?? null),
    pr: isPr ? r.pr : null,
    commit: r.commit,
    notes: r.kind === 'release' ? (r.notes ?? '') : null,
    image: { ref: r.image.ref, digest: r.image.digest, host: r.image.host },
    packages: (r.packages ?? []).map(({ name, version }) => ({ name, version })),
    requires: pickRequires(r.requires),
    migrates: r.migrates === true,
    built: { powerhouse: r.built.powerhouse, baseImage: r.built.baseImage },
  };
}

/** Job summary of what Vetra recorded. */
function summaryMarkdown(r) {
  const packages = r.packages.map((p) => `\`${p.name}@${p.version}\``).join(', ') || 'none';
  return [
    `### Vetra ${r.kind} ${r.version}`,
    '',
    '| | |',
    '|---|---|',
    `| Image | \`${r.image.ref}@${r.image.digest}\` |`,
    `| Commit | \`${r.commit}\` |`,
    `| Packages | ${packages} |`,
    `| Migrates | ${r.migrates ? 'yes' : 'no'} |`,
    '',
  ].join('\n');
}

;// CONCATENATED MODULE: ./src/rest.js
// Minimal REST client (global fetch, no dependencies) for the vetra-apps CI
// API, plus the pure helpers it's built on: the workload-token audience/base
// URL it's scoped to, and its `{ error, message }` error-response format.

function trimTrailingSlash(url) {
  return String(url).replace(/\/+$/, '');
}

/**
 * The audience the CI workload token must be minted for to call this API.
 * @param {string} vetraUrl
 */
function appsAudience(vetraUrl) {
  return `${trimTrailingSlash(vetraUrl)}/api/@powerhousedao/vetra-cloud-package/apps`;
}

/**
 * Base URL for the CI endpoints (registry-credentials, deploy, deployments/:id).
 * @param {string} vetraUrl
 */
function rest_appsCiBaseUrl(vetraUrl) {
  return `${appsAudience(vetraUrl)}/ci`;
}

/**
 * Formats a `{ error, message }` API error body as `"<error>: <message>"`.
 * @param {{ error?: string, message?: string }} body
 */
function formatApiError(body) {
  const code = body?.error ?? 'UNKNOWN_ERROR';
  const message = body?.message ?? 'unknown error';
  return `${code}: ${message}`;
}

/** Backoff before each retry of a request that never got an answer. */
const RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 20_000];

/**
 * A failure worth retrying: the request got no answer (undici's `fetch failed`
 * TypeError: reset, DNS, timeout) or a gateway in front of the switchboard
 * answered 502/503/504 while it restarts.
 */
function isTransient(err) {
  return isUnanswered(err) || /failed: HTTP 50[234]$/.test(String(err?.message));
}

/**
 * The request got no answer at all. The common case after a long image build
 * is a keep-alive socket the load balancer closed while it sat idle: the first
 * request after the build fails on it without reaching the switchboard.
 */
function isUnanswered(err) {
  return err instanceof TypeError;
}

async function request(method, url, token, body, fetchImpl, retry = {}) {
  const delays = retry.retries === 0 ? [] : RETRY_DELAYS_MS.slice(0, retry.retries ?? RETRY_DELAYS_MS.length);
  const sleep = retry.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; ; attempt++) {
    try {
      return await requestOnce(method, url, token, body, fetchImpl);
    } catch (err) {
      const retryable = retry.unansweredOnly ? isUnanswered(err) : isTransient(err);
      if (attempt >= delays.length || !retryable) throw err;
      console.log(`Vetra: ${method} ${url} failed (${err.message}); retrying in ${delays[attempt] / 1000}s.`);
      await sleep(delays[attempt]);
    }
  }
}

async function requestOnce(method, url, token, body, fetchImpl) {
  const res = await fetchImpl(url, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) {
    if (json && typeof json === 'object' && 'error' in json) {
      throw new Error(formatApiError(json));
    }
    throw new Error(`${url} failed: HTTP ${res.status}`);
  }
  return json;
}

/**
 * POSTs are retried only when they got no answer at all (see isUnanswered),
 * never on an HTTP error. A repeat is harmless for the CI API's POSTs: an
 * artifact version is recorded once, and a second /deploy of the same commit
 * supersedes the first.
 * @param {string} url
 * @param {string} token
 * @param {object} body
 * @param {{ fetchImpl?: typeof fetch, retries?: number, sleep?: (ms: number) => Promise<void> }} [opts]
 */
function rest_postJson(url, token, body, opts = {}) {
  return request('POST', url, token, body, opts.fetchImpl ?? fetch, {
    retries: opts.retries ?? 2,
    unansweredOnly: true,
    sleep: opts.sleep,
  });
}

/**
 * GETs are retried on transient failures (see isTransient).
 * @param {string} url
 * @param {string} token
 * @param {{ fetchImpl?: typeof fetch, retries?: number, sleep?: (ms: number) => Promise<void> }} [opts]
 */
function getJson(url, token, opts = {}) {
  return request('GET', url, token, undefined, opts.fetchImpl ?? fetch, {
    retries: opts.retries,
    sleep: opts.sleep,
  });
}

;// CONCATENATED MODULE: ./src/run-context.js
// What this run is, from the GitHub Actions environment. Vetra accepts
// reports only from `push` (branch refs) and `pull_request` runs, and checks
// that commit, ref and event match the workload token.

function runContext(env = process.env) {
  const sha = env.GITHUB_SHA;
  const repository = env.GITHUB_REPOSITORY;
  const runNumber = env.GITHUB_RUN_NUMBER;
  if (!sha || !repository || !runNumber) {
    throw new Error('not running in GitHub Actions (GITHUB_SHA, GITHUB_REPOSITORY or GITHUB_RUN_NUMBER missing)');
  }
  const event = env.GITHUB_EVENT_NAME;
  const ref = env.GITHUB_REF ?? '';
  if (event === 'push') {
    const m = /^refs\/heads\/(.+)$/.exec(ref);
    if (!m) throw new Error(`vetra-publish runs on branch pushes, not on ${ref}: remove the tag trigger from vetra.yml`);
    return { event, branch: m[1], pr: null, target: m[1], sha, repository, runNumber };
  }
  if (event === 'pull_request') {
    const m = /^refs\/pull\/(\d+)\/merge$/.exec(ref);
    if (!m || !env.GITHUB_BASE_REF) throw new Error(`unexpected pull request ref ${ref}`);
    return { event, branch: null, pr: Number(m[1]), target: env.GITHUB_BASE_REF, sha, repository, runNumber };
  }
  throw new Error(`vetra-publish runs on push and pull_request, not ${event}: Vetra records only those`);
}

/** `owner/name` of a GitHub remote URL, or null. */
function parseRemote(url) {
  const m = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\s*$/.exec(String(url));
  return m ? `${m[1]}/${m[2]}` : null;
}

;// CONCATENATED MODULE: ./src/exchange.js
// Renown workload token exchange (contract C1).

/**
 * Exchanges a GitHub OIDC subject token for a Renown bearer token scoped to
 * one target audience (a registry URL or the Vetra switchboard URL).
 * @param {string} renownUrl
 * @param {string} subjectToken
 * @param {string} audience
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 * @returns {Promise<string>}
 */
async function exchangeToken(renownUrl, subjectToken, audience, opts = {}) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const endpoint = `${renownUrl.replace(/\/+$/, '')}/api/@powerhousedao/renown-package/workload/token`;

  const res = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subject_token: subjectToken, audience }),
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const detail = body?.error_description ? `: ${body.error_description}` : '';
    throw new Error(
      `Renown workload token exchange failed for audience '${audience}': ` +
        `HTTP ${res.status} ${body?.error ?? ''}${detail}`.trim(),
    );
  }
  if (!body?.access_token) {
    throw new Error(`Renown workload token exchange for audience '${audience}' did not return an access_token`);
  }
  return body.access_token;
}

;// CONCATENATED MODULE: ./src/oidc.js
// GitHub OIDC ID token retrieval.

/**
 * Requests a GitHub Actions OIDC ID token for the given audience, using the
 * runner-provided `ACTIONS_ID_TOKEN_REQUEST_URL`/`ACTIONS_ID_TOKEN_REQUEST_TOKEN`
 * env vars. These are only present when the job grants
 * `permissions: { id-token: write }`, and GitHub never provides them (or any
 * secrets) to `pull_request` runs triggered from a forked repository.
 * @param {string} audience
 * @param {{ requestUrl?: string, requestToken?: string, fetchImpl?: typeof fetch }} [env]
 * @returns {Promise<string>}
 */
async function requestOidcToken(audience, env = {}) {
  const requestUrl = env.requestUrl ?? process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = env.requestToken ?? process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  const fetchImpl = env.fetchImpl ?? fetch;

  if (!requestUrl || !requestToken) {
    throw new Error(
      'GitHub OIDC token request variables are missing ' +
        '(ACTIONS_ID_TOKEN_REQUEST_URL / ACTIONS_ID_TOKEN_REQUEST_TOKEN). ' +
        "Add 'permissions: { id-token: write }' to the workflow or job. " +
        'Note: pull_request runs from a forked repository never receive OIDC tokens ' +
        '(or secrets), by GitHub design — fork PRs are not supported by this action.',
    );
  }

  const separator = requestUrl.includes('?') ? '&' : '?';
  const url = `${requestUrl}${separator}audience=${encodeURIComponent(audience)}`;
  const res = await fetchImpl(url, {
    headers: { authorization: `bearer ${requestToken}` },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub OIDC token request failed: HTTP ${res.status}${text ? ` ${text}` : ''}`);
  }

  const body = await res.json();
  if (!body?.value) {
    throw new Error('GitHub OIDC token response did not contain a value');
  }
  return body.value;
}

;// CONCATENATED MODULE: ./src/token-source.js
// Renown workload tokens live 10 minutes; a FUSION build plus the deploy wait
// can take longer. Re-mint instead of reusing the first token.

/**
 * @param {() => Promise<string>} mint
 * @param {{ maxAgeMs?: number, now?: () => number }} [opts]
 * @returns {() => Promise<string>}
 */
function createTokenSource(mint, { maxAgeMs = 5 * 60_000, now = Date.now } = {}) {
  let token = null;
  let mintedAt = 0;
  return async () => {
    if (!token || now() - mintedAt >= maxAgeMs) {
      token = await mint();
      mintedAt = now();
    }
    return token;
  };
}

;// CONCATENATED MODULE: ./src/tokens.js
// Renown workload tokens per audience. They live 10 minutes and an image
// build can take longer: each source re-mints after 5 minutes.






const RENOWN_OIDC_AUDIENCE = 'https://renown.vetra.io';

function renownTokens(renownUrl, audience) {
  return createTokenSource(async () => {
    const oidc = await requestOidcToken(RENOWN_OIDC_AUDIENCE);
    mask(oidc);
    const token = await exchangeToken(renownUrl, oidc, audience);
    mask(token);
    return token;
  });
}

;// CONCATENATED MODULE: ./src/vetra-api.js
// The vetra-apps CI routes this action calls (vetra-cloud-package
// subgraphs/vetra-apps/ci.ts), each with a Renown token for the Vetra
// audience.



/** POST ci/registry-token: push rights for the app's image repository (a 1-hour robot). */
function registryToken(vetraUrl, token, appId, opts = {}) {
  return postJson(`${appsCiBaseUrl(vetraUrl)}/registry-token`, token, { appId }, opts);
}

/** POST ci/github-token: the Vetra GitHub App's token, for a push to a release branch only (spec 14.1). */
function githubToken(vetraUrl, token, appId, opts = {}) {
  return postJson(`${appsCiBaseUrl(vetraUrl)}/github-token`, token, { appId }, opts);
}

const REPORT_DELAYS_MS = [5_000, 15_000, 30_000];

/**
 * POST ci/releases. Vetra answers SERVICE_UNAVAILABLE when Renown, Harbor or
 * GitHub did not answer: retried with a fresh token (a report is idempotent,
 * 200 for a version it already has with the same digest). Verdicts are not
 * retried.
 */
async function reportRelease(vetraUrl, getToken, body, opts = {}) {
  const delays = opts.delays ?? REPORT_DELAYS_MS;
  const sleep = opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; ; attempt++) {
    try {
      return await rest_postJson(`${rest_appsCiBaseUrl(vetraUrl)}/releases`, await getToken(), body, { fetchImpl: opts.fetchImpl });
    } catch (err) {
      const message = String(err?.message ?? err);
      if (message.startsWith('VERSION_CONFLICT:')) {
        throw new Error(
          `${message}. Vetra already has ${body.version} with another image digest, and tags are never moved: publish a new version instead.`,
        );
      }
      if (!message.startsWith('SERVICE_UNAVAILABLE:') || attempt >= delays.length) throw err;
      console.log(`Vetra: ${message}; retrying in ${delays[attempt] / 1000}s.`);
      await sleep(delays[attempt]);
    }
  }
}

;// CONCATENATED MODULE: ./src/finish-step.js
// Step 2 of vetra-publish, after the attestation: npm packages at the run's
// version, then POST ci/releases. Deploys nothing. Every collaborator is
// injectable (tests); src/finish.js runs it with the real ones.












const REAL = {
  actionInputs: actionInputs,
  runContext: runContext,
  cwd: () => process.cwd(),
  readVetraConfig: readVetraConfig,
  stepState: stepState,
  publishableDirs: publishableDirs,
  renownTokens: renownTokens,
  publishPackages: publishPackages,
  computeMigrates: computeMigrates,
  reportRelease: reportRelease,
  appendSummary: appendSummary,
  warning: warning,
  setOutput: setOutput,
};

async function finishStep(overrides = {}) {
  const d = { ...REAL, ...overrides };
  const input = d.actionInputs();
  const run = d.runContext();
  const config = d.readVetraConfig(d.cwd());
  const s = d.stepState();

  let packages = [];
  const dirs = d.publishableDirs(config.packageDirs, d.warning);
  if (dirs.length) {
    const registryUrl = registryFor({ releaseBranch: s.releaseBranch, event: run.event });
    const token = await d.renownTokens(input.renownUrl, registryUrl)();
    const distTag = distTagFor({ kind: s.kind, version: s.version, branch: run.branch, pr: run.pr, production: s.production });
    packages = d.publishPackages({ dirs, version: s.version, registryUrl, distTag, token });
  }

  const body = releaseBody({
    appId: input.appId,
    version: s.version,
    kind: s.kind,
    branch: run.branch,
    pr: run.pr,
    commit: run.sha,
    notes: s.notes,
    image: { ref: s.imageRef, digest: s.imageDigest, host: config.host },
    packages,
    requires: config.requires,
    // Needs the full history (actions/checkout fetch-depth: 0): migrates.js throws on a shallow clone.
    migrates: s.kind === 'release' ? d.computeMigrates({ version: s.version, config }) : false,
    built: { powerhouse: s.powerhouse, baseImage: s.baseImage },
  });
  const recorded = await d.reportRelease(input.vetraUrl, d.renownTokens(input.renownUrl, appsAudience(input.vetraUrl)), body);
  d.appendSummary(summaryMarkdown(recorded));
  const outputs = { kind: s.kind, version: s.version, image: `${s.imageRef}@${s.imageDigest}` };
  for (const [k, v] of Object.entries(outputs)) d.setOutput(k, v);
  return outputs;
}

;// CONCATENATED MODULE: ./src/fetch-retry.js
// Every request the action makes goes through fetch, and any of them can be
// the first one after a long image build or push: its pooled keep-alive
// connection was closed by a load balancer while it sat idle, and the request
// fails without an answer ("fetch failed"). Retried once or twice that way it
// opens a fresh connection. Only a request that got NO answer is retried; an
// HTTP error is returned as is. Every call the action makes is safe to repeat
// (token mint and exchange, artifact record, deploy: see rest.js).

const DELAYS_MS = [1_000, 3_000];

/**
 * @param {typeof fetch} fetchImpl
 * @param {{ delays?: number[], sleep?: (ms: number) => Promise<void>, log?: (msg: string) => void }} [opts]
 * @returns {typeof fetch}
 */
function withUnansweredRetry(fetchImpl, opts = {}) {
  const delays = opts.delays ?? DELAYS_MS;
  const sleep = opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const log = opts.log ?? ((msg) => console.log(msg));
  return async (input, init) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fetchImpl(input, init);
      } catch (err) {
        if (!(err instanceof TypeError) || attempt >= delays.length) throw err;
        const url = typeof input === 'string' ? input : String(input?.url ?? input);
        log(`Vetra: no answer from ${url.split('?')[0]} (${err.message}); retrying.`);
        await sleep(delays[attempt]);
      }
    }
  };
}

;// CONCATENATED MODULE: ./src/finish.js
// Entry point of the vetra-publish finish step (bundled to dist/finish/index.js).





// A request after a long build can hit a dead keep-alive socket.
globalThis.fetch = withUnansweredRetry(globalThis.fetch);
finishStep().catch((err) => setFailed(err?.stack || String(err?.message || err)));

