/*!
  Highlight.js v11.11.1 (git: 08cb242e7d)
  (c) 2006-2025 Josh Goebel <hello@joshgoebel.com> and other contributors
  License: BSD-3-Clause
 */
var hljs = (function () {
  'use strict';

  /* eslint-disable no-multi-assign */

  function deepFreeze(obj) {
    if (obj instanceof Map) {
      obj.clear =
        obj.delete =
        obj.set =
          function () {
            throw new Error('map is read-only');
          };
    } else if (obj instanceof Set) {
      obj.add =
        obj.clear =
        obj.delete =
          function () {
            throw new Error('set is read-only');
          };
    }

    // Freeze self
    Object.freeze(obj);

    Object.getOwnPropertyNames(obj).forEach((name) => {
      const prop = obj[name];
      const type = typeof prop;

      // Freeze prop if it is an object or function and also not already frozen
      if ((type === 'object' || type === 'function') && !Object.isFrozen(prop)) {
        deepFreeze(prop);
      }
    });

    return obj;
  }

  /** @typedef {import('highlight.js').CallbackResponse} CallbackResponse */
  /** @typedef {import('highlight.js').CompiledMode} CompiledMode */
  /** @implements CallbackResponse */

  class Response {
    /**
     * @param {CompiledMode} mode
     */
    constructor(mode) {
      // eslint-disable-next-line no-undefined
      if (mode.data === undefined) mode.data = {};

      this.data = mode.data;
      this.isMatchIgnored = false;
    }

    ignoreMatch() {
      this.isMatchIgnored = true;
    }
  }

  /**
   * @param {string} value
   * @returns {string}
   */
  function escapeHTML(value) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  /**
   * performs a shallow merge of multiple objects into one
   *
   * @template T
   * @param {T} original
   * @param {Record<string,any>[]} objects
   * @returns {T} a single new object
   */
  function inherit$1(original, ...objects) {
    /** @type Record<string,any> */
    const result = Object.create(null);

    for (const key in original) {
      result[key] = original[key];
    }
    objects.forEach(function(obj) {
      for (const key in obj) {
        result[key] = obj[key];
      }
    });
    return /** @type {T} */ (result);
  }

  /**
   * @typedef {object} Renderer
   * @property {(text: string) => void} addText
   * @property {(node: Node) => void} openNode
   * @property {(node: Node) => void} closeNode
   * @property {() => string} value
   */

  /** @typedef {{scope?: string, language?: string, sublanguage?: boolean}} Node */
  /** @typedef {{walk: (r: Renderer) => void}} Tree */
  /** */

  const SPAN_CLOSE = '</span>';

  /**
   * Determines if a node needs to be wrapped in <span>
   *
   * @param {Node} node */
  const emitsWrappingTags = (node) => {
    // rarely we can have a sublanguage where language is undefined
    // TODO: track down why
    return !!node.scope;
  };

  /**
   *
   * @param {string} name
   * @param {{prefix:string}} options
   */
  const scopeToCSSClass = (name, { prefix }) => {
    // sub-language
    if (name.startsWith("language:")) {
      return name.replace("language:", "language-");
    }
    // tiered scope: comment.line
    if (name.includes(".")) {
      const pieces = name.split(".");
      return [
        `${prefix}${pieces.shift()}`,
        ...(pieces.map((x, i) => `${x}${"_".repeat(i + 1)}`))
      ].join(" ");
    }
    // simple scope
    return `${prefix}${name}`;
  };

  /** @type {Renderer} */
  class HTMLRenderer {
    /**
     * Creates a new HTMLRenderer
     *
     * @param {Tree} parseTree - the parse tree (must support `walk` API)
     * @param {{classPrefix: string}} options
     */
    constructor(parseTree, options) {
      this.buffer = "";
      this.classPrefix = options.classPrefix;
      parseTree.walk(this);
    }

    /**
     * Adds texts to the output stream
     *
     * @param {string} text */
    addText(text) {
      this.buffer += escapeHTML(text);
    }

    /**
     * Adds a node open to the output stream (if needed)
     *
     * @param {Node} node */
    openNode(node) {
      if (!emitsWrappingTags(node)) return;

      const className = scopeToCSSClass(node.scope,
        { prefix: this.classPrefix });
      this.span(className);
    }

    /**
     * Adds a node close to the output stream (if needed)
     *
     * @param {Node} node */
    closeNode(node) {
      if (!emitsWrappingTags(node)) return;

      this.buffer += SPAN_CLOSE;
    }

    /**
     * returns the accumulated buffer
    */
    value() {
      return this.buffer;
    }

    // helpers

    /**
     * Builds a span element
     *
     * @param {string} className */
    span(className) {
      this.buffer += `<span class="${className}">`;
    }
  }

  /** @typedef {{scope?: string, language?: string, children: Node[]} | string} Node */
  /** @typedef {{scope?: string, language?: string, children: Node[]} } DataNode */
  /** @typedef {import('highlight.js').Emitter} Emitter */
  /**  */

  /** @returns {DataNode} */
  const newNode = (opts = {}) => {
    /** @type DataNode */
    const result = { children: [] };
    Object.assign(result, opts);
    return result;
  };

  class TokenTree {
    constructor() {
      /** @type DataNode */
      this.rootNode = newNode();
      this.stack = [this.rootNode];
    }

    get top() {
      return this.stack[this.stack.length - 1];
    }

    get root() { return this.rootNode; }

    /** @param {Node} node */
    add(node) {
      this.top.children.push(node);
    }

    /** @param {string} scope */
    openNode(scope) {
      /** @type Node */
      const node = newNode({ scope });
      this.add(node);
      this.stack.push(node);
    }

    closeNode() {
      if (this.stack.length > 1) {
        return this.stack.pop();
      }
      // eslint-disable-next-line no-undefined
      return undefined;
    }

    closeAllNodes() {
      while (this.closeNode());
    }

    toJSON() {
      return JSON.stringify(this.rootNode, null, 4);
    }

    /**
     * @typedef { import("./html_renderer").Renderer } Renderer
     * @param {Renderer} builder
     */
    walk(builder) {
      // this does not
      return this.constructor._walk(builder, this.rootNode);
      // this works
      // return TokenTree._walk(builder, this.rootNode);
    }

    /**
     * @param {Renderer} builder
     * @param {Node} node
     */
    static _walk(builder, node) {
      if (typeof node === "string") {
        builder.addText(node);
      } else if (node.children) {
        builder.openNode(node);
        node.children.forEach((child) => this._walk(builder, child));
        builder.closeNode(node);
      }
      return builder;
    }

    /**
     * @param {Node} node
     */
    static _collapse(node) {
      if (typeof node === "string") return;
      if (!node.children) return;

      if (node.children.every(el => typeof el === "string")) {
        // node.text = node.children.join("");
        // delete node.children;
        node.children = [node.children.join("")];
      } else {
        node.children.forEach((child) => {
          TokenTree._collapse(child);
        });
      }
    }
  }

  /**
    Currently this is all private API, but this is the minimal API necessary
    that an Emitter must implement to fully support the parser.

    Minimal interface:

    - addText(text)
    - __addSublanguage(emitter, subLanguageName)
    - startScope(scope)
    - endScope()
    - finalize()
    - toHTML()

  */

  /**
   * @implements {Emitter}
   */
  class TokenTreeEmitter extends TokenTree {
    /**
     * @param {*} options
     */
    constructor(options) {
      super();
      this.options = options;
    }

    /**
     * @param {string} text
     */
    addText(text) {
      if (text === "") { return; }

      this.add(text);
    }

    /** @param {string} scope */
    startScope(scope) {
      this.openNode(scope);
    }

    endScope() {
      this.closeNode();
    }

    /**
     * @param {Emitter & {root: DataNode}} emitter
     * @param {string} name
     */
    __addSublanguage(emitter, name) {
      /** @type DataNode */
      const node = emitter.root;
      if (name) node.scope = `language:${name}`;

      this.add(node);
    }

    toHTML() {
      const renderer = new HTMLRenderer(this, this.options);
      return renderer.value();
    }

    finalize() {
      this.closeAllNodes();
      return true;
    }
  }

  /**
   * @param {string} value
   * @returns {RegExp}
   * */

  /**
   * @param {RegExp | string } re
   * @returns {string}
   */
  function source(re) {
    if (!re) return null;
    if (typeof re === "string") return re;

    return re.source;
  }

  /**
   * @param {RegExp | string } re
   * @returns {string}
   */
  function lookahead(re) {
    return concat('(?=', re, ')');
  }

  /**
   * @param {RegExp | string } re
   * @returns {string}
   */
  function anyNumberOfTimes(re) {
    return concat('(?:', re, ')*');
  }

  /**
   * @param {RegExp | string } re
   * @returns {string}
   */
  function optional(re) {
    return concat('(?:', re, ')?');
  }

  /**
   * @param {...(RegExp | string) } args
   * @returns {string}
   */
  function concat(...args) {
    const joined = args.map((x) => source(x)).join("");
    return joined;
  }

  /**
   * @param { Array<string | RegExp | Object> } args
   * @returns {object}
   */
  function stripOptionsFromArgs(args) {
    const opts = args[args.length - 1];

    if (typeof opts === 'object' && opts.constructor === Object) {
      args.splice(args.length - 1, 1);
      return opts;
    } else {
      return {};
    }
  }

  /** @typedef { {capture?: boolean} } RegexEitherOptions */

  /**
   * Any of the passed expresssions may match
   *
   * Creates a huge this | this | that | that match
   * @param {(RegExp | string)[] | [...(RegExp | string)[], RegexEitherOptions]} args
   * @returns {string}
   */
  function either(...args) {
    /** @type { object & {capture?: boolean} }  */
    const opts = stripOptionsFromArgs(args);
    const joined = '('
      + (opts.capture ? "" : "?:")
      + args.map((x) => source(x)).join("|") + ")";
    return joined;
  }

  /**
   * @param {RegExp | string} re
   * @returns {number}
   */
  function countMatchGroups(re) {
    return (new RegExp(re.toString() + '|')).exec('').length - 1;
  }

  /**
   * Does lexeme start with a regular expression match at the beginning
   * @param {RegExp} re
   * @param {string} lexeme
   */
  function startsWith(re, lexeme) {
    const match = re && re.exec(lexeme);
    return match && match.index === 0;
  }

  // BACKREF_RE matches an open parenthesis or backreference. To avoid
  // an incorrect parse, it additionally matches the following:
  // - [...] elements, where the meaning of parentheses and escapes change
  // - other escape sequences, so we do not misparse escape sequences as
  //   interesting elements
  // - non-matching or lookahead parentheses, which do not capture. These
  //   follow the '(' with a '?'.
  const BACKREF_RE = /\[(?:[^\\\]]|\\.)*\]|\(\??|\\([1-9][0-9]*)|\\./;

  // **INTERNAL** Not intended for outside usage
  // join logically computes regexps.join(separator), but fixes the
  // backreferences so they continue to match.
  // it also places each individual regular expression into it's own
  // match group, keeping track of the sequencing of those match groups
  // is currently an exercise for the caller. :-)
  /**
   * @param {(string | RegExp)[]} regexps
   * @param {{joinWith: string}} opts
   * @returns {string}
   */
  function _rewriteBackreferences(regexps, { joinWith }) {
    let numCaptures = 0;

    return regexps.map((regex) => {
      numCaptures += 1;
      const offset = numCaptures;
      let re = source(regex);
      let out = '';

      while (re.length > 0) {
        const match = BACKREF_RE.exec(re);
        if (!match) {
          out += re;
          break;
        }
        out += re.substring(0, match.index);
        re = re.substring(match.index + match[0].length);
        if (match[0][0] === '\\' && match[1]) {
          // Adjust the backreference.
          out += '\\' + String(Number(match[1]) + offset);
        } else {
          out += match[0];
          if (match[0] === '(') {
            numCaptures++;
          }
        }
      }
      return out;
    }).map(re => `(${re})`).join(joinWith);
  }

  /** @typedef {import('highlight.js').Mode} Mode */
  /** @typedef {import('highlight.js').ModeCallback} ModeCallback */

  // Common regexps
  const MATCH_NOTHING_RE = /\b\B/;
  const IDENT_RE = '[a-zA-Z]\\w*';
  const UNDERSCORE_IDENT_RE = '[a-zA-Z_]\\w*';
  const NUMBER_RE = '\\b\\d+(\\.\\d+)?';
  const C_NUMBER_RE = '(-?)(\\b0[xX][a-fA-F0-9]+|(\\b\\d+(\\.\\d*)?|\\.\\d+)([eE][-+]?\\d+)?)'; // 0x..., 0..., decimal, float
  const BINARY_NUMBER_RE = '\\b(0b[01]+)'; // 0b...
  const RE_STARTERS_RE = '!|!=|!==|%|%=|&|&&|&=|\\*|\\*=|\\+|\\+=|,|-|-=|/=|/|:|;|<<|<<=|<=|<|===|==|=|>>>=|>>=|>=|>>>|>>|>|\\?|\\[|\\{|\\(|\\^|\\^=|\\||\\|=|\\|\\||~';

  /**
  * @param { Partial<Mode> & {binary?: string | RegExp} } opts
  */
  const SHEBANG = (opts = {}) => {
    const beginShebang = /^#![ ]*\//;
    if (opts.binary) {
      opts.begin = concat(
        beginShebang,
        /.*\b/,
        opts.binary,
        /\b.*/);
    }
    return inherit$1({
      scope: 'meta',
      begin: beginShebang,
      end: /$/,
      relevance: 0,
      /** @type {ModeCallback} */
      "on:begin": (m, resp) => {
        if (m.index !== 0) resp.ignoreMatch();
      }
    }, opts);
  };

  // Common modes
  const BACKSLASH_ESCAPE = {
    begin: '\\\\[\\s\\S]', relevance: 0
  };
  const APOS_STRING_MODE = {
    scope: 'string',
    begin: '\'',
    end: '\'',
    illegal: '\\n',
    contains: [BACKSLASH_ESCAPE]
  };
  const QUOTE_STRING_MODE = {
    scope: 'string',
    begin: '"',
    end: '"',
    illegal: '\\n',
    contains: [BACKSLASH_ESCAPE]
  };
  const PHRASAL_WORDS_MODE = {
    begin: /\b(a|an|the|are|I'm|isn't|don't|doesn't|won't|but|just|should|pretty|simply|enough|gonna|going|wtf|so|such|will|you|your|they|like|more)\b/
  };
  /**
   * Creates a comment mode
   *
   * @param {string | RegExp} begin
   * @param {string | RegExp} end
   * @param {Mode | {}} [modeOptions]
   * @returns {Partial<Mode>}
   */
  const COMMENT = function(begin, end, modeOptions = {}) {
    const mode = inherit$1(
      {
        scope: 'comment',
        begin,
        end,
        contains: []
      },
      modeOptions
    );
    mode.contains.push({
      scope: 'doctag',
      // hack to avoid the space from being included. the space is necessary to
      // match here to prevent the plain text rule below from gobbling up doctags
      begin: '[ ]*(?=(TODO|FIXME|NOTE|BUG|OPTIMIZE|HACK|XXX):)',
      end: /(TODO|FIXME|NOTE|BUG|OPTIMIZE|HACK|XXX):/,
      excludeBegin: true,
      relevance: 0
    });
    const ENGLISH_WORD = either(
      // list of common 1 and 2 letter words in English
      "I",
      "a",
      "is",
      "so",
      "us",
      "to",
      "at",
      "if",
      "in",
      "it",
      "on",
      // note: this is not an exhaustive list of contractions, just popular ones
      /[A-Za-z]+['](d|ve|re|ll|t|s|n)/, // contractions - can't we'd they're let's, etc
      /[A-Za-z]+[-][a-z]+/, // `no-way`, etc.
      /[A-Za-z][a-z]{2,}/ // allow capitalized words at beginning of sentences
    );
    // looking like plain text, more likely to be a comment
    mode.contains.push(
      {
        // TODO: how to include ", (, ) without breaking grammars that use these for
        // comment delimiters?
        // begin: /[ ]+([()"]?([A-Za-z'-]{3,}|is|a|I|so|us|[tT][oO]|at|if|in|it|on)[.]?[()":]?([.][ ]|[ ]|\))){3}/
        // ---

        // this tries to find sequences of 3 english words in a row (without any
        // "programming" type syntax) this gives us a strong signal that we've
        // TRULY found a comment - vs perhaps scanning with the wrong language.
        // It's possible to find something that LOOKS like the start of the
        // comment - but then if there is no readable text - good chance it is a
        // false match and not a comment.
        //
        // for a visual example please see:
        // https://github.com/highlightjs/highlight.js/issues/2827

        begin: concat(
          /[ ]+/, // necessary to prevent us gobbling up doctags like /* @author Bob Mcgill */
          '(',
          ENGLISH_WORD,
          /[.]?[:]?([.][ ]|[ ])/,
          '){3}') // look for 3 words in a row
      }
    );
    return mode;
  };
  const C_LINE_COMMENT_MODE = COMMENT('//', '$');
  const C_BLOCK_COMMENT_MODE = COMMENT('/\\*', '\\*/');
  const HASH_COMMENT_MODE = COMMENT('#', '$');
  const NUMBER_MODE = {
    scope: 'number',
    begin: NUMBER_RE,
    relevance: 0
  };
  const C_NUMBER_MODE = {
    scope: 'number',
    begin: C_NUMBER_RE,
    relevance: 0
  };
  const BINARY_NUMBER_MODE = {
    scope: 'number',
    begin: BINARY_NUMBER_RE,
    relevance: 0
  };
  const REGEXP_MODE = {
    scope: "regexp",
    begin: /\/(?=[^/\n]*\/)/,
    end: /\/[gimuy]*/,
    contains: [
      BACKSLASH_ESCAPE,
      {
        begin: /\[/,
        end: /\]/,
        relevance: 0,
        contains: [BACKSLASH_ESCAPE]
      }
    ]
  };
  const TITLE_MODE = {
    scope: 'title',
    begin: IDENT_RE,
    relevance: 0
  };
  const UNDERSCORE_TITLE_MODE = {
    scope: 'title',
    begin: UNDERSCORE_IDENT_RE,
    relevance: 0
  };
  const METHOD_GUARD = {
    // excludes method names from keyword processing
    begin: '\\.\\s*' + UNDERSCORE_IDENT_RE,
    relevance: 0
  };

  /**
   * Adds end same as begin mechanics to a mode
   *
   * Your mode must include at least a single () match group as that first match
   * group is what is used for comparison
   * @param {Partial<Mode>} mode
   */
  const END_SAME_AS_BEGIN = function(mode) {
    return Object.assign(mode,
      {
        /** @type {ModeCallback} */
        'on:begin': (m, resp) => { resp.data._beginMatch = m[1]; },
        /** @type {ModeCallback} */
        'on:end': (m, resp) => { if (resp.data._beginMatch !== m[1]) resp.ignoreMatch(); }
      });
  };

  var MODES = /*#__PURE__*/Object.freeze({
    __proto__: null,
    APOS_STRING_MODE: APOS_STRING_MODE,
    BACKSLASH_ESCAPE: BACKSLASH_ESCAPE,
    BINARY_NUMBER_MODE: BINARY_NUMBER_MODE,
    BINARY_NUMBER_RE: BINARY_NUMBER_RE,
    COMMENT: COMMENT,
    C_BLOCK_COMMENT_MODE: C_BLOCK_COMMENT_MODE,
    C_LINE_COMMENT_MODE: C_LINE_COMMENT_MODE,
    C_NUMBER_MODE: C_NUMBER_MODE,
    C_NUMBER_RE: C_NUMBER_RE,
    END_SAME_AS_BEGIN: END_SAME_AS_BEGIN,
    HASH_COMMENT_MODE: HASH_COMMENT_MODE,
    IDENT_RE: IDENT_RE,
    MATCH_NOTHING_RE: MATCH_NOTHING_RE,
    METHOD_GUARD: METHOD_GUARD,
    NUMBER_MODE: NUMBER_MODE,
    NUMBER_RE: NUMBER_RE,
    PHRASAL_WORDS_MODE: PHRASAL_WORDS_MODE,
    QUOTE_STRING_MODE: QUOTE_STRING_MODE,
    REGEXP_MODE: REGEXP_MODE,
    RE_STARTERS_RE: RE_STARTERS_RE,
    SHEBANG: SHEBANG,
    TITLE_MODE: TITLE_MODE,
    UNDERSCORE_IDENT_RE: UNDERSCORE_IDENT_RE,
    UNDERSCORE_TITLE_MODE: UNDERSCORE_TITLE_MODE
  });

  /**
  @typedef {import('highlight.js').CallbackResponse} CallbackResponse
  @typedef {import('highlight.js').CompilerExt} CompilerExt
  */

  // Grammar extensions / plugins
  // See: https://github.com/highlightjs/highlight.js/issues/2833

  // Grammar extensions allow "syntactic sugar" to be added to the grammar modes
  // without requiring any underlying changes to the compiler internals.

  // `compileMatch` being the perfect small example of now allowing a grammar
  // author to write `match` when they desire to match a single expression rather
  // than being forced to use `begin`.  The extension then just moves `match` into
  // `begin` when it runs.  Ie, no features have been added, but we've just made
  // the experience of writing (and reading grammars) a little bit nicer.

  // ------

  // TODO: We need negative look-behind support to do this properly
  /**
   * Skip a match if it has a preceding dot
   *
   * This is used for `beginKeywords` to prevent matching expressions such as
   * `bob.keyword.do()`. The mode compiler automatically wires this up as a
   * special _internal_ 'on:begin' callback for modes with `beginKeywords`
   * @param {RegExpMatchArray} match
   * @param {CallbackResponse} response
   */
  function skipIfHasPrecedingDot(match, response) {
    const before = match.input[match.index - 1];
    if (before === ".") {
      response.ignoreMatch();
    }
  }

  /**
   *
   * @type {CompilerExt}
   */
  function scopeClassName(mode, _parent) {
    // eslint-disable-next-line no-undefined
    if (mode.className !== undefined) {
      mode.scope = mode.className;
      delete mode.className;
    }
  }

  /**
   * `beginKeywords` syntactic sugar
   * @type {CompilerExt}
   */
  function beginKeywords(mode, parent) {
    if (!parent) return;
    if (!mode.beginKeywords) return;

    // for languages with keywords that include non-word characters checking for
    // a word boundary is not sufficient, so instead we check for a word boundary
    // or whitespace - this does no harm in any case since our keyword engine
    // doesn't allow spaces in keywords anyways and we still check for the boundary
    // first
    mode.begin = '\\b(' + mode.beginKeywords.split(' ').join('|') + ')(?!\\.)(?=\\b|\\s)';
    mode.__beforeBegin = skipIfHasPrecedingDot;
    mode.keywords = mode.keywords || mode.beginKeywords;
    delete mode.beginKeywords;

    // prevents double relevance, the keywords themselves provide
    // relevance, the mode doesn't need to double it
    // eslint-disable-next-line no-undefined
    if (mode.relevance === undefined) mode.relevance = 0;
  }

  /**
   * Allow `illegal` to contain an array of illegal values
   * @type {CompilerExt}
   */
  function compileIllegal(mode, _parent) {
    if (!Array.isArray(mode.illegal)) return;

    mode.illegal = either(...mode.illegal);
  }

  /**
   * `match` to match a single expression for readability
   * @type {CompilerExt}
   */
  function compileMatch(mode, _parent) {
    if (!mode.match) return;
    if (mode.begin || mode.end) throw new Error("begin & end are not supported with match");

    mode.begin = mode.match;
    delete mode.match;
  }

  /**
   * provides the default 1 relevance to all modes
   * @type {CompilerExt}
   */
  function compileRelevance(mode, _parent) {
    // eslint-disable-next-line no-undefined
    if (mode.relevance === undefined) mode.relevance = 1;
  }

  // allow beforeMatch to act as a "qualifier" for the match
  // the full match begin must be [beforeMatch][begin]
  const beforeMatchExt = (mode, parent) => {
    if (!mode.beforeMatch) return;
    // starts conflicts with endsParent which we need to make sure the child
    // rule is not matched multiple times
    if (mode.starts) throw new Error("beforeMatch cannot be used with starts");

    const originalMode = Object.assign({}, mode);
    Object.keys(mode).forEach((key) => { delete mode[key]; });

    mode.keywords = originalMode.keywords;
    mode.begin = concat(originalMode.beforeMatch, lookahead(originalMode.begin));
    mode.starts = {
      relevance: 0,
      contains: [
        Object.assign(originalMode, { endsParent: true })
      ]
    };
    mode.relevance = 0;

    delete originalMode.beforeMatch;
  };

  // keywords that should have no default relevance value
  const COMMON_KEYWORDS = [
    'of',
    'and',
    'for',
    'in',
    'not',
    'or',
    'if',
    'then',
    'parent', // common variable name
    'list', // common variable name
    'value' // common variable name
  ];

  const DEFAULT_KEYWORD_SCOPE = "keyword";

  /**
   * Given raw keywords from a language definition, compile them.
   *
   * @param {string | Record<string,string|string[]> | Array<string>} rawKeywords
   * @param {boolean} caseInsensitive
   */
  function compileKeywords(rawKeywords, caseInsensitive, scopeName = DEFAULT_KEYWORD_SCOPE) {
    /** @type {import("highlight.js/private").KeywordDict} */
    const compiledKeywords = Object.create(null);

    // input can be a string of keywords, an array of keywords, or a object with
    // named keys representing scopeName (which can then point to a string or array)
    if (typeof rawKeywords === 'string') {
      compileList(scopeName, rawKeywords.split(" "));
    } else if (Array.isArray(rawKeywords)) {
      compileList(scopeName, rawKeywords);
    } else {
      Object.keys(rawKeywords).forEach(function(scopeName) {
        // collapse all our objects back into the parent object
        Object.assign(
          compiledKeywords,
          compileKeywords(rawKeywords[scopeName], caseInsensitive, scopeName)
        );
      });
    }
    return compiledKeywords;

    // ---

    /**
     * Compiles an individual list of keywords
     *
     * Ex: "for if when while|5"
     *
     * @param {string} scopeName
     * @param {Array<string>} keywordList
     */
    function compileList(scopeName, keywordList) {
      if (caseInsensitive) {
        keywordList = keywordList.map(x => x.toLowerCase());
      }
      keywordList.forEach(function(keyword) {
        const pair = keyword.split('|');
        compiledKeywords[pair[0]] = [scopeName, scoreForKeyword(pair[0], pair[1])];
      });
    }
  }

  /**
   * Returns the proper score for a given keyword
   *
   * Also takes into account comment keywords, which will be scored 0 UNLESS
   * another score has been manually assigned.
   * @param {string} keyword
   * @param {string} [providedScore]
   */
  function scoreForKeyword(keyword, providedScore) {
    // manual scores always win over common keywords
    // so you can force a score of 1 if you really insist
    if (providedScore) {
      return Number(providedScore);
    }

    return commonKeyword(keyword) ? 0 : 1;
  }

  /**
   * Determines if a given keyword is common or not
   *
   * @param {string} keyword */
  function commonKeyword(keyword) {
    return COMMON_KEYWORDS.includes(keyword.toLowerCase());
  }

  /*

  For the reasoning behind this please see:
  https://github.com/highlightjs/highlight.js/issues/2880#issuecomment-747275419

  */

  /**
   * @type {Record<string, boolean>}
   */
  const seenDeprecations = {};

  /**
   * @param {string} message
   */
  const error = (message) => {
    console.error(message);
  };

  /**
   * @param {string} message
   * @param {any} args
   */
  const warn = (message, ...args) => {
    console.log(`WARN: ${message}`, ...args);
  };

  /**
   * @param {string} version
   * @param {string} message
   */
  const deprecated = (version, message) => {
    if (seenDeprecations[`${version}/${message}`]) return;

    console.log(`Deprecated as of ${version}. ${message}`);
    seenDeprecations[`${version}/${message}`] = true;
  };

  /* eslint-disable no-throw-literal */

  /**
  @typedef {import('highlight.js').CompiledMode} CompiledMode
  */

  const MultiClassError = new Error();

  /**
   * Renumbers labeled scope names to account for additional inner match
   * groups that otherwise would break everything.
   *
   * Lets say we 3 match scopes:
   *
   *   { 1 => ..., 2 => ..., 3 => ... }
   *
   * So what we need is a clean match like this:
   *
   *   (a)(b)(c) => [ "a", "b", "c" ]
   *
   * But this falls apart with inner match groups:
   *
   * (a)(((b)))(c) => ["a", "b", "b", "b", "c" ]
   *
   * Our scopes are now "out of alignment" and we're repeating `b` 3 times.
   * What needs to happen is the numbers are remapped:
   *
   *   { 1 => ..., 2 => ..., 5 => ... }
   *
   * We also need to know that the ONLY groups that should be output
   * are 1, 2, and 5.  This function handles this behavior.
   *
   * @param {CompiledMode} mode
   * @param {Array<RegExp | string>} regexes
   * @param {{key: "beginScope"|"endScope"}} opts
   */
  function remapScopeNames(mode, regexes, { key }) {
    let offset = 0;
    const scopeNames = mode[key];
    /** @type Record<number,boolean> */
    const emit = {};
    /** @type Record<number,string> */
    const positions = {};

    for (let i = 1; i <= regexes.length; i++) {
      positions[i + offset] = scopeNames[i];
      emit[i + offset] = true;
      offset += countMatchGroups(regexes[i - 1]);
    }
    // we use _emit to keep track of which match groups are "top-level" to avoid double
    // output from inside match groups
    mode[key] = positions;
    mode[key]._emit = emit;
    mode[key]._multi = true;
  }

  /**
   * @param {CompiledMode} mode
   */
  function beginMultiClass(mode) {
    if (!Array.isArray(mode.begin)) return;

    if (mode.skip || mode.excludeBegin || mode.returnBegin) {
      error("skip, excludeBegin, returnBegin not compatible with beginScope: {}");
      throw MultiClassError;
    }

    if (typeof mode.beginScope !== "object" || mode.beginScope === null) {
      error("beginScope must be object");
      throw MultiClassError;
    }

    remapScopeNames(mode, mode.begin, { key: "beginScope" });
    mode.begin = _rewriteBackreferences(mode.begin, { joinWith: "" });
  }

  /**
   * @param {CompiledMode} mode
   */
  function endMultiClass(mode) {
    if (!Array.isArray(mode.end)) return;

    if (mode.skip || mode.excludeEnd || mode.returnEnd) {
      error("skip, excludeEnd, returnEnd not compatible with endScope: {}");
      throw MultiClassError;
    }

    if (typeof mode.endScope !== "object" || mode.endScope === null) {
      error("endScope must be object");
      throw MultiClassError;
    }

    remapScopeNames(mode, mode.end, { key: "endScope" });
    mode.end = _rewriteBackreferences(mode.end, { joinWith: "" });
  }

  /**
   * this exists only to allow `scope: {}` to be used beside `match:`
   * Otherwise `beginScope` would necessary and that would look weird

    {
      match: [ /def/, /\w+/ ]
      scope: { 1: "keyword" , 2: "title" }
    }

   * @param {CompiledMode} mode
   */
  function scopeSugar(mode) {
    if (mode.scope && typeof mode.scope === "object" && mode.scope !== null) {
      mode.beginScope = mode.scope;
      delete mode.scope;
    }
  }

  /**
   * @param {CompiledMode} mode
   */
  function MultiClass(mode) {
    scopeSugar(mode);

    if (typeof mode.beginScope === "string") {
      mode.beginScope = { _wrap: mode.beginScope };
    }
    if (typeof mode.endScope === "string") {
      mode.endScope = { _wrap: mode.endScope };
    }

    beginMultiClass(mode);
    endMultiClass(mode);
  }

  /**
  @typedef {import('highlight.js').Mode} Mode
  @typedef {import('highlight.js').CompiledMode} CompiledMode
  @typedef {import('highlight.js').Language} Language
  @typedef {import('highlight.js').HLJSPlugin} HLJSPlugin
  @typedef {import('highlight.js').CompiledLanguage} CompiledLanguage
  */

  // compilation

  /**
   * Compiles a language definition result
   *
   * Given the raw result of a language definition (Language), compiles this so
   * that it is ready for highlighting code.
   * @param {Language} language
   * @returns {CompiledLanguage}
   */
  function compileLanguage(language) {
    /**
     * Builds a regex with the case sensitivity of the current language
     *
     * @param {RegExp | string} value
     * @param {boolean} [global]
     */
    function langRe(value, global) {
      return new RegExp(
        source(value),
        'm'
        + (language.case_insensitive ? 'i' : '')
        + (language.unicodeRegex ? 'u' : '')
        + (global ? 'g' : '')
      );
    }

    /**
      Stores multiple regular expressions and allows you to quickly search for
      them all in a string simultaneously - returning the first match.  It does
      this by creating a huge (a|b|c) regex - each individual item wrapped with ()
      and joined by `|` - using match groups to track position.  When a match is
      found checking which position in the array has content allows us to figure
      out which of the original regexes / match groups triggered the match.

      The match object itself (the result of `Regex.exec`) is returned but also
      enhanced by merging in any meta-data that was registered with the regex.
      This is how we keep track of which mode matched, and what type of rule
      (`illegal`, `begin`, end, etc).
    */
    class MultiRegex {
      constructor() {
        this.matchIndexes = {};
        // @ts-ignore
        this.regexes = [];
        this.matchAt = 1;
        this.position = 0;
      }

      // @ts-ignore
      addRule(re, opts) {
        opts.position = this.position++;
        // @ts-ignore
        this.matchIndexes[this.matchAt] = opts;
        this.regexes.push([opts, re]);
        this.matchAt += countMatchGroups(re) + 1;
      }

      compile() {
        if (this.regexes.length === 0) {
          // avoids the need to check length every time exec is called
          // @ts-ignore
          this.exec = () => null;
        }
        const terminators = this.regexes.map(el => el[1]);
        this.matcherRe = langRe(_rewriteBackreferences(terminators, { joinWith: '|' }), true);
        this.lastIndex = 0;
      }

      /** @param {string} s */
      exec(s) {
        this.matcherRe.lastIndex = this.lastIndex;
        const match = this.matcherRe.exec(s);
        if (!match) { return null; }

        // eslint-disable-next-line no-undefined
        const i = match.findIndex((el, i) => i > 0 && el !== undefined);
        // @ts-ignore
        const matchData = this.matchIndexes[i];
        // trim off any earlier non-relevant match groups (ie, the other regex
        // match groups that make up the multi-matcher)
        match.splice(0, i);

        return Object.assign(match, matchData);
      }
    }

    /*
      Created to solve the key deficiently with MultiRegex - there is no way to
      test for multiple matches at a single location.  Why would we need to do
      that?  In the future a more dynamic engine will allow certain matches to be
      ignored.  An example: if we matched say the 3rd regex in a large group but
      decided to ignore it - we'd need to started testing again at the 4th
      regex... but MultiRegex itself gives us no real way to do that.

      So what this class creates MultiRegexs on the fly for whatever search
      position they are needed.

      NOTE: These additional MultiRegex objects are created dynamically.  For most
      grammars most of the time we will never actually need anything more than the
      first MultiRegex - so this shouldn't have too much overhead.

      Say this is our search group, and we match regex3, but wish to ignore it.

        regex1 | regex2 | regex3 | regex4 | regex5    ' ie, startAt = 0

      What we need is a new MultiRegex that only includes the remaining
      possibilities:

        regex4 | regex5                               ' ie, startAt = 3

      This class wraps all that complexity up in a simple API... `startAt` decides
      where in the array of expressions to start doing the matching. It
      auto-increments, so if a match is found at position 2, then startAt will be
      set to 3.  If the end is reached startAt will return to 0.

      MOST of the time the parser will be setting startAt manually to 0.
    */
    class ResumableMultiRegex {
      constructor() {
        // @ts-ignore
        this.rules = [];
        // @ts-ignore
        this.multiRegexes = [];
        this.count = 0;

        this.lastIndex = 0;
        this.regexIndex = 0;
      }

      // @ts-ignore
      getMatcher(index) {
        if (this.multiRegexes[index]) return this.multiRegexes[index];

        const matcher = new MultiRegex();
        this.rules.slice(index).forEach(([re, opts]) => matcher.addRule(re, opts));
        matcher.compile();
        this.multiRegexes[index] = matcher;
        return matcher;
      }

      resumingScanAtSamePosition() {
        return this.regexIndex !== 0;
      }

      considerAll() {
        this.regexIndex = 0;
      }

      // @ts-ignore
      addRule(re, opts) {
        this.rules.push([re, opts]);
        if (opts.type === "begin") this.count++;
      }

      /** @param {string} s */
      exec(s) {
        const m = this.getMatcher(this.regexIndex);
        m.lastIndex = this.lastIndex;
        let result = m.exec(s);

        // The following is because we have no easy way to say "resume scanning at the
        // existing position but also skip the current rule ONLY". What happens is
        // all prior rules are also skipped which can result in matching the wrong
        // thing. Example of matching "booger":

        // our matcher is [string, "booger", number]
        //
        // ....booger....

        // if "booger" is ignored then we'd really need a regex to scan from the
        // SAME position for only: [string, number] but ignoring "booger" (if it
        // was the first match), a simple resume would scan ahead who knows how
        // far looking only for "number", ignoring potential string matches (or
        // future "booger" matches that might be valid.)

        // So what we do: We execute two matchers, one resuming at the same
        // position, but the second full matcher starting at the position after:

        //     /--- resume first regex match here (for [number])
        //     |/---- full match here for [string, "booger", number]
        //     vv
        // ....booger....

        // Which ever results in a match first is then used. So this 3-4 step
        // process essentially allows us to say "match at this position, excluding
        // a prior rule that was ignored".
        //
        // 1. Match "booger" first, ignore. Also proves that [string] does non match.
        // 2. Resume matching for [number]
        // 3. Match at index + 1 for [string, "booger", number]
        // 4. If #2 and #3 result in matches, which came first?
        if (this.resumingScanAtSamePosition()) {
          if (result && result.index === this.lastIndex) ; else { // use the second matcher result
            const m2 = this.getMatcher(0);
            m2.lastIndex = this.lastIndex + 1;
            result = m2.exec(s);
          }
        }

        if (result) {
          this.regexIndex += result.position + 1;
          if (this.regexIndex === this.count) {
            // wrap-around to considering all matches again
            this.considerAll();
          }
        }

        return result;
      }
    }

    /**
     * Given a mode, builds a huge ResumableMultiRegex that can be used to walk
     * the content and find matches.
     *
     * @param {CompiledMode} mode
     * @returns {ResumableMultiRegex}
     */
    function buildModeRegex(mode) {
      const mm = new ResumableMultiRegex();

      mode.contains.forEach(term => mm.addRule(term.begin, { rule: term, type: "begin" }));

      if (mode.terminatorEnd) {
        mm.addRule(mode.terminatorEnd, { type: "end" });
      }
      if (mode.illegal) {
        mm.addRule(mode.illegal, { type: "illegal" });
      }

      return mm;
    }

    /** skip vs abort vs ignore
     *
     * @skip   - The mode is still entered and exited normally (and contains rules apply),
     *           but all content is held and added to the parent buffer rather than being
     *           output when the mode ends.  Mostly used with `sublanguage` to build up
     *           a single large buffer than can be parsed by sublanguage.
     *
     *             - The mode begin ands ends normally.
     *             - Content matched is added to the parent mode buffer.
     *             - The parser cursor is moved forward normally.
     *
     * @abort  - A hack placeholder until we have ignore.  Aborts the mode (as if it
     *           never matched) but DOES NOT continue to match subsequent `contains`
     *           modes.  Abort is bad/suboptimal because it can result in modes
     *           farther down not getting applied because an earlier rule eats the
     *           content but then aborts.
     *
     *             - The mode does not begin.
     *             - Content matched by `begin` is added to the mode buffer.
     *             - The parser cursor is moved forward accordingly.
     *
     * @ignore - Ignores the mode (as if it never matched) and continues to match any
     *           subsequent `contains` modes.  Ignore isn't technically possible with
     *           the current parser implementation.
     *
     *             - The mode does not begin.
     *             - Content matched by `begin` is ignored.
     *             - The parser cursor is not moved forward.
     */

    /**
     * Compiles an individual mode
     *
     * This can raise an error if the mode contains certain detectable known logic
     * issues.
     * @param {Mode} mode
     * @param {CompiledMode | null} [parent]
     * @returns {CompiledMode | never}
     */
    function compileMode(mode, parent) {
      const cmode = /** @type CompiledMode */ (mode);
      if (mode.isCompiled) return cmode;

      [
        scopeClassName,
        // do this early so compiler extensions generally don't have to worry about
        // the distinction between match/begin
        compileMatch,
        MultiClass,
        beforeMatchExt
      ].forEach(ext => ext(mode, parent));

      language.compilerExtensions.forEach(ext => ext(mode, parent));

      // __beforeBegin is considered private API, internal use only
      mode.__beforeBegin = null;

      [
        beginKeywords,
        // do this later so compiler extensions that come earlier have access to the
        // raw array if they wanted to perhaps manipulate it, etc.
        compileIllegal,
        // default to 1 relevance if not specified
        compileRelevance
      ].forEach(ext => ext(mode, parent));

      mode.isCompiled = true;

      let keywordPattern = null;
      if (typeof mode.keywords === "object" && mode.keywords.$pattern) {
        // we need a copy because keywords might be compiled multiple times
        // so we can't go deleting $pattern from the original on the first
        // pass
        mode.keywords = Object.assign({}, mode.keywords);
        keywordPattern = mode.keywords.$pattern;
        delete mode.keywords.$pattern;
      }
      keywordPattern = keywordPattern || /\w+/;

      if (mode.keywords) {
        mode.keywords = compileKeywords(mode.keywords, language.case_insensitive);
      }

      cmode.keywordPatternRe = langRe(keywordPattern, true);

      if (parent) {
        if (!mode.begin) mode.begin = /\B|\b/;
        cmode.beginRe = langRe(cmode.begin);
        if (!mode.end && !mode.endsWithParent) mode.end = /\B|\b/;
        if (mode.end) cmode.endRe = langRe(cmode.end);
        cmode.terminatorEnd = source(cmode.end) || '';
        if (mode.endsWithParent && parent.terminatorEnd) {
          cmode.terminatorEnd += (mode.end ? '|' : '') + parent.terminatorEnd;
        }
      }
      if (mode.illegal) cmode.illegalRe = langRe(/** @type {RegExp | string} */ (mode.illegal));
      if (!mode.contains) mode.contains = [];

      mode.contains = [].concat(...mode.contains.map(function(c) {
        return expandOrCloneMode(c === 'self' ? mode : c);
      }));
      mode.contains.forEach(function(c) { compileMode(/** @type Mode */ (c), cmode); });

      if (mode.starts) {
        compileMode(mode.starts, parent);
      }

      cmode.matcher = buildModeRegex(cmode);
      return cmode;
    }

    if (!language.compilerExtensions) language.compilerExtensions = [];

    // self is not valid at the top-level
    if (language.contains && language.contains.includes('self')) {
      throw new Error("ERR: contains `self` is not supported at the top-level of a language.  See documentation.");
    }

    // we need a null object, which inherit will guarantee
    language.classNameAliases = inherit$1(language.classNameAliases || {});

    return compileMode(/** @type Mode */ (language));
  }

  /**
   * Determines if a mode has a dependency on it's parent or not
   *
   * If a mode does have a parent dependency then often we need to clone it if
   * it's used in multiple places so that each copy points to the correct parent,
   * where-as modes without a parent can often safely be re-used at the bottom of
   * a mode chain.
   *
   * @param {Mode | null} mode
   * @returns {boolean} - is there a dependency on the parent?
   * */
  function dependencyOnParent(mode) {
    if (!mode) return false;

    return mode.endsWithParent || dependencyOnParent(mode.starts);
  }

  /**
   * Expands a mode or clones it if necessary
   *
   * This is necessary for modes with parental dependenceis (see notes on
   * `dependencyOnParent`) and for nodes that have `variants` - which must then be
   * exploded into their own individual modes at compile time.
   *
   * @param {Mode} mode
   * @returns {Mode | Mode[]}
   * */
  function expandOrCloneMode(mode) {
    if (mode.variants && !mode.cachedVariants) {
      mode.cachedVariants = mode.variants.map(function(variant) {
        return inherit$1(mode, { variants: null }, variant);
      });
    }

    // EXPAND
    // if we have variants then essentially "replace" the mode with the variants
    // this happens in compileMode, where this function is called from
    if (mode.cachedVariants) {
      return mode.cachedVariants;
    }

    // CLONE
    // if we have dependencies on parents then we need a unique
    // instance of ourselves, so we can be reused with many
    // different parents without issue
    if (dependencyOnParent(mode)) {
      return inherit$1(mode, { starts: mode.starts ? inherit$1(mode.starts) : null });
    }

    if (Object.isFrozen(mode)) {
      return inherit$1(mode);
    }

    // no special dependency issues, just return ourselves
    return mode;
  }

  var version = "11.11.1";

  class HTMLInjectionError extends Error {
    constructor(reason, html) {
      super(reason);
      this.name = "HTMLInjectionError";
      this.html = html;
    }
  }

  /*
  Syntax highlighting with language autodetection.
  https://highlightjs.org/
  */



  /**
  @typedef {import('highlight.js').Mode} Mode
  @typedef {import('highlight.js').CompiledMode} CompiledMode
  @typedef {import('highlight.js').CompiledScope} CompiledScope
  @typedef {import('highlight.js').Language} Language
  @typedef {import('highlight.js').HLJSApi} HLJSApi
  @typedef {import('highlight.js').HLJSPlugin} HLJSPlugin
  @typedef {import('highlight.js').PluginEvent} PluginEvent
  @typedef {import('highlight.js').HLJSOptions} HLJSOptions
  @typedef {import('highlight.js').LanguageFn} LanguageFn
  @typedef {import('highlight.js').HighlightedHTMLElement} HighlightedHTMLElement
  @typedef {import('highlight.js').BeforeHighlightContext} BeforeHighlightContext
  @typedef {import('highlight.js/private').MatchType} MatchType
  @typedef {import('highlight.js/private').KeywordData} KeywordData
  @typedef {import('highlight.js/private').EnhancedMatch} EnhancedMatch
  @typedef {import('highlight.js/private').AnnotatedError} AnnotatedError
  @typedef {import('highlight.js').AutoHighlightResult} AutoHighlightResult
  @typedef {import('highlight.js').HighlightOptions} HighlightOptions
  @typedef {import('highlight.js').HighlightResult} HighlightResult
  */


  const escape = escapeHTML;
  const inherit = inherit$1;
  const NO_MATCH = Symbol("nomatch");
  const MAX_KEYWORD_HITS = 7;

  /**
   * @param {any} hljs - object that is extended (legacy)
   * @returns {HLJSApi}
   */
  const HLJS = function(hljs) {
    // Global internal variables used within the highlight.js library.
    /** @type {Record<string, Language>} */
    const languages = Object.create(null);
    /** @type {Record<string, string>} */
    const aliases = Object.create(null);
    /** @type {HLJSPlugin[]} */
    const plugins = [];

    // safe/production mode - swallows more errors, tries to keep running
    // even if a single syntax or parse hits a fatal error
    let SAFE_MODE = true;
    const LANGUAGE_NOT_FOUND = "Could not find the language '{}', did you forget to load/include a language module?";
    /** @type {Language} */
    const PLAINTEXT_LANGUAGE = { disableAutodetect: true, name: 'Plain text', contains: [] };

    // Global options used when within external APIs. This is modified when
    // calling the `hljs.configure` function.
    /** @type HLJSOptions */
    let options = {
      ignoreUnescapedHTML: false,
      throwUnescapedHTML: false,
      noHighlightRe: /^(no-?highlight)$/i,
      languageDetectRe: /\blang(?:uage)?-([\w-]+)\b/i,
      classPrefix: 'hljs-',
      cssSelector: 'pre code',
      languages: null,
      // beta configuration options, subject to change, welcome to discuss
      // https://github.com/highlightjs/highlight.js/issues/1086
      __emitter: TokenTreeEmitter
    };

    /* Utility functions */

    /**
     * Tests a language name to see if highlighting should be skipped
     * @param {string} languageName
     */
    function shouldNotHighlight(languageName) {
      return options.noHighlightRe.test(languageName);
    }

    /**
     * @param {HighlightedHTMLElement} block - the HTML element to determine language for
     */
    function blockLanguage(block) {
      let classes = block.className + ' ';

      classes += block.parentNode ? block.parentNode.className : '';

      // language-* takes precedence over non-prefixed class names.
      const match = options.languageDetectRe.exec(classes);
      if (match) {
        const language = getLanguage(match[1]);
        if (!language) {
          warn(LANGUAGE_NOT_FOUND.replace("{}", match[1]));
          warn("Falling back to no-highlight mode for this block.", block);
        }
        return language ? match[1] : 'no-highlight';
      }

      return classes
        .split(/\s+/)
        .find((_class) => shouldNotHighlight(_class) || getLanguage(_class));
    }

    /**
     * Core highlighting function.
     *
     * OLD API
     * highlight(lang, code, ignoreIllegals, continuation)
     *
     * NEW API
     * highlight(code, {lang, ignoreIllegals})
     *
     * @param {string} codeOrLanguageName - the language to use for highlighting
     * @param {string | HighlightOptions} optionsOrCode - the code to highlight
     * @param {boolean} [ignoreIllegals] - whether to ignore illegal matches, default is to bail
     *
     * @returns {HighlightResult} Result - an object that represents the result
     * @property {string} language - the language name
     * @property {number} relevance - the relevance score
     * @property {string} value - the highlighted HTML code
     * @property {string} code - the original raw code
     * @property {CompiledMode} top - top of the current mode stack
     * @property {boolean} illegal - indicates whether any illegal matches were found
    */
    function highlight(codeOrLanguageName, optionsOrCode, ignoreIllegals) {
      let code = "";
      let languageName = "";
      if (typeof optionsOrCode === "object") {
        code = codeOrLanguageName;
        ignoreIllegals = optionsOrCode.ignoreIllegals;
        languageName = optionsOrCode.language;
      } else {
        // old API
        deprecated("10.7.0", "highlight(lang, code, ...args) has been deprecated.");
        deprecated("10.7.0", "Please use highlight(code, options) instead.\nhttps://github.com/highlightjs/highlight.js/issues/2277");
        languageName = codeOrLanguageName;
        code = optionsOrCode;
      }

      // https://github.com/highlightjs/highlight.js/issues/3149
      // eslint-disable-next-line no-undefined
      if (ignoreIllegals === undefined) { ignoreIllegals = true; }

      /** @type {BeforeHighlightContext} */
      const context = {
        code,
        language: languageName
      };
      // the plugin can change the desired language or the code to be highlighted
      // just be changing the object it was passed
      fire("before:highlight", context);

      // a before plugin can usurp the result completely by providing it's own
      // in which case we don't even need to call highlight
      const result = context.result
        ? context.result
        : _highlight(context.language, context.code, ignoreIllegals);

      result.code = context.code;
      // the plugin can change anything in result to suite it
      fire("after:highlight", result);

      return result;
    }

    /**
     * private highlight that's used internally and does not fire callbacks
     *
     * @param {string} languageName - the language to use for highlighting
     * @param {string} codeToHighlight - the code to highlight
     * @param {boolean?} [ignoreIllegals] - whether to ignore illegal matches, default is to bail
     * @param {CompiledMode?} [continuation] - current continuation mode, if any
     * @returns {HighlightResult} - result of the highlight operation
    */
    function _highlight(languageName, codeToHighlight, ignoreIllegals, continuation) {
      const keywordHits = Object.create(null);

      /**
       * Return keyword data if a match is a keyword
       * @param {CompiledMode} mode - current mode
       * @param {string} matchText - the textual match
       * @returns {KeywordData | false}
       */
      function keywordData(mode, matchText) {
        return mode.keywords[matchText];
      }

      function processKeywords() {
        if (!top.keywords) {
          emitter.addText(modeBuffer);
          return;
        }

        let lastIndex = 0;
        top.keywordPatternRe.lastIndex = 0;
        let match = top.keywordPatternRe.exec(modeBuffer);
        let buf = "";

        while (match) {
          buf += modeBuffer.substring(lastIndex, match.index);
          const word = language.case_insensitive ? match[0].toLowerCase() : match[0];
          const data = keywordData(top, word);
          if (data) {
            const [kind, keywordRelevance] = data;
            emitter.addText(buf);
            buf = "";

            keywordHits[word] = (keywordHits[word] || 0) + 1;
            if (keywordHits[word] <= MAX_KEYWORD_HITS) relevance += keywordRelevance;
            if (kind.startsWith("_")) {
              // _ implied for relevance only, do not highlight
              // by applying a class name
              buf += match[0];
            } else {
              const cssClass = language.classNameAliases[kind] || kind;
              emitKeyword(match[0], cssClass);
            }
          } else {
            buf += match[0];
          }
          lastIndex = top.keywordPatternRe.lastIndex;
          match = top.keywordPatternRe.exec(modeBuffer);
        }
        buf += modeBuffer.substring(lastIndex);
        emitter.addText(buf);
      }

      function processSubLanguage() {
        if (modeBuffer === "") return;
        /** @type HighlightResult */
        let result = null;

        if (typeof top.subLanguage === 'string') {
          if (!languages[top.subLanguage]) {
            emitter.addText(modeBuffer);
            return;
          }
          result = _highlight(top.subLanguage, modeBuffer, true, continuations[top.subLanguage]);
          continuations[top.subLanguage] = /** @type {CompiledMode} */ (result._top);
        } else {
          result = highlightAuto(modeBuffer, top.subLanguage.length ? top.subLanguage : null);
        }

        // Counting embedded language score towards the host language may be disabled
        // with zeroing the containing mode relevance. Use case in point is Markdown that
        // allows XML everywhere and makes every XML snippet to have a much larger Markdown
        // score.
        if (top.relevance > 0) {
          relevance += result.relevance;
        }
        emitter.__addSublanguage(result._emitter, result.language);
      }

      function processBuffer() {
        if (top.subLanguage != null) {
          processSubLanguage();
        } else {
          processKeywords();
        }
        modeBuffer = '';
      }

      /**
       * @param {string} text
       * @param {string} scope
       */
      function emitKeyword(keyword, scope) {
        if (keyword === "") return;

        emitter.startScope(scope);
        emitter.addText(keyword);
        emitter.endScope();
      }

      /**
       * @param {CompiledScope} scope
       * @param {RegExpMatchArray} match
       */
      function emitMultiClass(scope, match) {
        let i = 1;
        const max = match.length - 1;
        while (i <= max) {
          if (!scope._emit[i]) { i++; continue; }
          const klass = language.classNameAliases[scope[i]] || scope[i];
          const text = match[i];
          if (klass) {
            emitKeyword(text, klass);
          } else {
            modeBuffer = text;
            processKeywords();
            modeBuffer = "";
          }
          i++;
        }
      }

      /**
       * @param {CompiledMode} mode - new mode to start
       * @param {RegExpMatchArray} match
       */
      function startNewMode(mode, match) {
        if (mode.scope && typeof mode.scope === "string") {
          emitter.openNode(language.classNameAliases[mode.scope] || mode.scope);
        }
        if (mode.beginScope) {
          // beginScope just wraps the begin match itself in a scope
          if (mode.beginScope._wrap) {
            emitKeyword(modeBuffer, language.classNameAliases[mode.beginScope._wrap] || mode.beginScope._wrap);
            modeBuffer = "";
          } else if (mode.beginScope._multi) {
            // at this point modeBuffer should just be the match
            emitMultiClass(mode.beginScope, match);
            modeBuffer = "";
          }
        }

        top = Object.create(mode, { parent: { value: top } });
        return top;
      }

      /**
       * @param {CompiledMode } mode - the mode to potentially end
       * @param {RegExpMatchArray} match - the latest match
       * @param {string} matchPlusRemainder - match plus remainder of content
       * @returns {CompiledMode | void} - the next mode, or if void continue on in current mode
       */
      function endOfMode(mode, match, matchPlusRemainder) {
        let matched = startsWith(mode.endRe, matchPlusRemainder);

        if (matched) {
          if (mode["on:end"]) {
            const resp = new Response(mode);
            mode["on:end"](match, resp);
            if (resp.isMatchIgnored) matched = false;
          }

          if (matched) {
            while (mode.endsParent && mode.parent) {
              mode = mode.parent;
            }
            return mode;
          }
        }
        // even if on:end fires an `ignore` it's still possible
        // that we might trigger the end node because of a parent mode
        if (mode.endsWithParent) {
          return endOfMode(mode.parent, match, matchPlusRemainder);
        }
      }

      /**
       * Handle matching but then ignoring a sequence of text
       *
       * @param {string} lexeme - string containing full match text
       */
      function doIgnore(lexeme) {
        if (top.matcher.regexIndex === 0) {
          // no more regexes to potentially match here, so we move the cursor forward one
          // space
          modeBuffer += lexeme[0];
          return 1;
        } else {
          // no need to move the cursor, we still have additional regexes to try and
          // match at this very spot
          resumeScanAtSamePosition = true;
          return 0;
        }
      }

      /**
       * Handle the start of a new potential mode match
       *
       * @param {EnhancedMatch} match - the current match
       * @returns {number} how far to advance the parse cursor
       */
      function doBeginMatch(match) {
        const lexeme = match[0];
        const newMode = match.rule;

        const resp = new Response(newMode);
        // first internal before callbacks, then the public ones
        const beforeCallbacks = [newMode.__beforeBegin, newMode["on:begin"]];
        for (const cb of beforeCallbacks) {
          if (!cb) continue;
          cb(match, resp);
          if (resp.isMatchIgnored) return doIgnore(lexeme);
        }

        if (newMode.skip) {
          modeBuffer += lexeme;
        } else {
          if (newMode.excludeBegin) {
            modeBuffer += lexeme;
          }
          processBuffer();
          if (!newMode.returnBegin && !newMode.excludeBegin) {
            modeBuffer = lexeme;
          }
        }
        startNewMode(newMode, match);
        return newMode.returnBegin ? 0 : lexeme.length;
      }

      /**
       * Handle the potential end of mode
       *
       * @param {RegExpMatchArray} match - the current match
       */
      function doEndMatch(match) {
        const lexeme = match[0];
        const matchPlusRemainder = codeToHighlight.substring(match.index);

        const endMode = endOfMode(top, match, matchPlusRemainder);
        if (!endMode) { return NO_MATCH; }

        const origin = top;
        if (top.endScope && top.endScope._wrap) {
          processBuffer();
          emitKeyword(lexeme, top.endScope._wrap);
        } else if (top.endScope && top.endScope._multi) {
          processBuffer();
          emitMultiClass(top.endScope, match);
        } else if (origin.skip) {
          modeBuffer += lexeme;
        } else {
          if (!(origin.returnEnd || origin.excludeEnd)) {
            modeBuffer += lexeme;
          }
          processBuffer();
          if (origin.excludeEnd) {
            modeBuffer = lexeme;
          }
        }
        do {
          if (top.scope) {
            emitter.closeNode();
          }
          if (!top.skip && !top.subLanguage) {
            relevance += top.relevance;
          }
          top = top.parent;
        } while (top !== endMode.parent);
        if (endMode.starts) {
          startNewMode(endMode.starts, match);
        }
        return origin.returnEnd ? 0 : lexeme.length;
      }

      function processContinuations() {
        const list = [];
        for (let current = top; current !== language; current = current.parent) {
          if (current.scope) {
            list.unshift(current.scope);
          }
        }
        list.forEach(item => emitter.openNode(item));
      }

      /** @type {{type?: MatchType, index?: number, rule?: Mode}}} */
      let lastMatch = {};

      /**
       *  Process an individual match
       *
       * @param {string} textBeforeMatch - text preceding the match (since the last match)
       * @param {EnhancedMatch} [match] - the match itself
       */
      function processLexeme(textBeforeMatch, match) {
        const lexeme = match && match[0];

        // add non-matched text to the current mode buffer
        modeBuffer += textBeforeMatch;

        if (lexeme == null) {
          processBuffer();
          return 0;
        }

        // we've found a 0 width match and we're stuck, so we need to advance
        // this happens when we have badly behaved rules that have optional matchers to the degree that
        // sometimes they can end up matching nothing at all
        // Ref: https://github.com/highlightjs/highlight.js/issues/2140
        if (lastMatch.type === "begin" && match.type === "end" && lastMatch.index === match.index && lexeme === "") {
          // spit the "skipped" character that our regex choked on back into the output sequence
          modeBuffer += codeToHighlight.slice(match.index, match.index + 1);
          if (!SAFE_MODE) {
            /** @type {AnnotatedError} */
            const err = new Error(`0 width match regex (${languageName})`);
            err.languageName = languageName;
            err.badRule = lastMatch.rule;
            throw err;
          }
          return 1;
        }
        lastMatch = match;

        if (match.type === "begin") {
          return doBeginMatch(match);
        } else if (match.type === "illegal" && !ignoreIllegals) {
          // illegal match, we do not continue processing
          /** @type {AnnotatedError} */
          const err = new Error('Illegal lexeme "' + lexeme + '" for mode "' + (top.scope || '<unnamed>') + '"');
          err.mode = top;
          throw err;
        } else if (match.type === "end") {
          const processed = doEndMatch(match);
          if (processed !== NO_MATCH) {
            return processed;
          }
        }

        // edge case for when illegal matches $ (end of line) which is technically
        // a 0 width match but not a begin/end match so it's not caught by the
        // first handler (when ignoreIllegals is true)
        if (match.type === "illegal" && lexeme === "") {
          // advance so we aren't stuck in an infinite loop
          modeBuffer += "\n";
          return 1;
        }

        // infinite loops are BAD, this is a last ditch catch all. if we have a
        // decent number of iterations yet our index (cursor position in our
        // parsing) still 3x behind our index then something is very wrong
        // so we bail
        if (iterations > 100000 && iterations > match.index * 3) {
          const err = new Error('potential infinite loop, way more iterations than matches');
          throw err;
        }

        /*
        Why might be find ourselves here?  An potential end match that was
        triggered but could not be completed.  IE, `doEndMatch` returned NO_MATCH.
        (this could be because a callback requests the match be ignored, etc)

        This causes no real harm other than stopping a few times too many.
        */

        modeBuffer += lexeme;
        return lexeme.length;
      }

      const language = getLanguage(languageName);
      if (!language) {
        error(LANGUAGE_NOT_FOUND.replace("{}", languageName));
        throw new Error('Unknown language: "' + languageName + '"');
      }

      const md = compileLanguage(language);
      let result = '';
      /** @type {CompiledMode} */
      let top = continuation || md;
      /** @type Record<string,CompiledMode> */
      const continuations = {}; // keep continuations for sub-languages
      const emitter = new options.__emitter(options);
      processContinuations();
      let modeBuffer = '';
      let relevance = 0;
      let index = 0;
      let iterations = 0;
      let resumeScanAtSamePosition = false;

      try {
        if (!language.__emitTokens) {
          top.matcher.considerAll();

          for (;;) {
            iterations++;
            if (resumeScanAtSamePosition) {
              // only regexes not matched previously will now be
              // considered for a potential match
              resumeScanAtSamePosition = false;
            } else {
              top.matcher.considerAll();
            }
            top.matcher.lastIndex = index;

            const match = top.matcher.exec(codeToHighlight);
            // console.log("match", match[0], match.rule && match.rule.begin)

            if (!match) break;

            const beforeMatch = codeToHighlight.substring(index, match.index);
            const processedCount = processLexeme(beforeMatch, match);
            index = match.index + processedCount;
          }
          processLexeme(codeToHighlight.substring(index));
        } else {
          language.__emitTokens(codeToHighlight, emitter);
        }

        emitter.finalize();
        result = emitter.toHTML();

        return {
          language: languageName,
          value: result,
          relevance,
          illegal: false,
          _emitter: emitter,
          _top: top
        };
      } catch (err) {
        if (err.message && err.message.includes('Illegal')) {
          return {
            language: languageName,
            value: escape(codeToHighlight),
            illegal: true,
            relevance: 0,
            _illegalBy: {
              message: err.message,
              index,
              context: codeToHighlight.slice(index - 100, index + 100),
              mode: err.mode,
              resultSoFar: result
            },
            _emitter: emitter
          };
        } else if (SAFE_MODE) {
          return {
            language: languageName,
            value: escape(codeToHighlight),
            illegal: false,
            relevance: 0,
            errorRaised: err,
            _emitter: emitter,
            _top: top
          };
        } else {
          throw err;
        }
      }
    }

    /**
     * returns a valid highlight result, without actually doing any actual work,
     * auto highlight starts with this and it's possible for small snippets that
     * auto-detection may not find a better match
     * @param {string} code
     * @returns {HighlightResult}
     */
    function justTextHighlightResult(code) {
      const result = {
        value: escape(code),
        illegal: false,
        relevance: 0,
        _top: PLAINTEXT_LANGUAGE,
        _emitter: new options.__emitter(options)
      };
      result._emitter.addText(code);
      return result;
    }

    /**
    Highlighting with language detection. Accepts a string with the code to
    highlight. Returns an object with the following properties:

    - language (detected language)
    - relevance (int)
    - value (an HTML string with highlighting markup)
    - secondBest (object with the same structure for second-best heuristically
      detected language, may be absent)

      @param {string} code
      @param {Array<string>} [languageSubset]
      @returns {AutoHighlightResult}
    */
    function highlightAuto(code, languageSubset) {
      languageSubset = languageSubset || options.languages || Object.keys(languages);
      const plaintext = justTextHighlightResult(code);

      const results = languageSubset.filter(getLanguage).filter(autoDetection).map(name =>
        _highlight(name, code, false)
      );
      results.unshift(plaintext); // plaintext is always an option

      const sorted = results.sort((a, b) => {
        // sort base on relevance
        if (a.relevance !== b.relevance) return b.relevance - a.relevance;

        // always award the tie to the base language
        // ie if C++ and Arduino are tied, it's more likely to be C++
        if (a.language && b.language) {
          if (getLanguage(a.language).supersetOf === b.language) {
            return 1;
          } else if (getLanguage(b.language).supersetOf === a.language) {
            return -1;
          }
        }

        // otherwise say they are equal, which has the effect of sorting on
        // relevance while preserving the original ordering - which is how ties
        // have historically been settled, ie the language that comes first always
        // wins in the case of a tie
        return 0;
      });

      const [best, secondBest] = sorted;

      /** @type {AutoHighlightResult} */
      const result = best;
      result.secondBest = secondBest;

      return result;
    }

    /**
     * Builds new class name for block given the language name
     *
     * @param {HTMLElement} element
     * @param {string} [currentLang]
     * @param {string} [resultLang]
     */
    function updateClassName(element, currentLang, resultLang) {
      const language = (currentLang && aliases[currentLang]) || resultLang;

      element.classList.add("hljs");
      element.classList.add(`language-${language}`);
    }

    /**
     * Applies highlighting to a DOM node containing code.
     *
     * @param {HighlightedHTMLElement} element - the HTML element to highlight
    */
    function highlightElement(element) {
      /** @type HTMLElement */
      let node = null;
      const language = blockLanguage(element);

      if (shouldNotHighlight(language)) return;

      fire("before:highlightElement",
        { el: element, language });

      if (element.dataset.highlighted) {
        console.log("Element previously highlighted. To highlight again, first unset `dataset.highlighted`.", element);
        return;
      }

      // we should be all text, no child nodes (unescaped HTML) - this is possibly
      // an HTML injection attack - it's likely too late if this is already in
      // production (the code has likely already done its damage by the time
      // we're seeing it)... but we yell loudly about this so that hopefully it's
      // more likely to be caught in development before making it to production
      if (element.children.length > 0) {
        if (!options.ignoreUnescapedHTML) {
          console.warn("One of your code blocks includes unescaped HTML. This is a potentially serious security risk.");
          console.warn("https://github.com/highlightjs/highlight.js/wiki/security");
          console.warn("The element with unescaped HTML:");
          console.warn(element);
        }
        if (options.throwUnescapedHTML) {
          const err = new HTMLInjectionError(
            "One of your code blocks includes unescaped HTML.",
            element.innerHTML
          );
          throw err;
        }
      }

      node = element;
      const text = node.textContent;
      const result = language ? highlight(text, { language, ignoreIllegals: true }) : highlightAuto(text);

      element.innerHTML = result.value;
      element.dataset.highlighted = "yes";
      updateClassName(element, language, result.language);
      element.result = {
        language: result.language,
        // TODO: remove with version 11.0
        re: result.relevance,
        relevance: result.relevance
      };
      if (result.secondBest) {
        element.secondBest = {
          language: result.secondBest.language,
          relevance: result.secondBest.relevance
        };
      }

      fire("after:highlightElement", { el: element, result, text });
    }

    /**
     * Updates highlight.js global options with the passed options
     *
     * @param {Partial<HLJSOptions>} userOptions
     */
    function configure(userOptions) {
      options = inherit(options, userOptions);
    }

    // TODO: remove v12, deprecated
    const initHighlighting = () => {
      highlightAll();
      deprecated("10.6.0", "initHighlighting() deprecated.  Use highlightAll() now.");
    };

    // TODO: remove v12, deprecated
    function initHighlightingOnLoad() {
      highlightAll();
      deprecated("10.6.0", "initHighlightingOnLoad() deprecated.  Use highlightAll() now.");
    }

    let wantsHighlight = false;

    /**
     * auto-highlights all pre>code elements on the page
     */
    function highlightAll() {
      function boot() {
        // if a highlight was requested before DOM was loaded, do now
        highlightAll();
      }

      // if we are called too early in the loading process
      if (document.readyState === "loading") {
        // make sure the event listener is only added once
        if (!wantsHighlight) {
          window.addEventListener('DOMContentLoaded', boot, false);
        }
        wantsHighlight = true;
        return;
      }

      const blocks = document.querySelectorAll(options.cssSelector);
      blocks.forEach(highlightElement);
    }

    /**
     * Register a language grammar module
     *
     * @param {string} languageName
     * @param {LanguageFn} languageDefinition
     */
    function registerLanguage(languageName, languageDefinition) {
      let lang = null;
      try {
        lang = languageDefinition(hljs);
      } catch (error$1) {
        error("Language definition for '{}' could not be registered.".replace("{}", languageName));
        // hard or soft error
        if (!SAFE_MODE) { throw error$1; } else { error(error$1); }
        // languages that have serious errors are replaced with essentially a
        // "plaintext" stand-in so that the code blocks will still get normal
        // css classes applied to them - and one bad language won't break the
        // entire highlighter
        lang = PLAINTEXT_LANGUAGE;
      }
      // give it a temporary name if it doesn't have one in the meta-data
      if (!lang.name) lang.name = languageName;
      languages[languageName] = lang;
      lang.rawDefinition = languageDefinition.bind(null, hljs);

      if (lang.aliases) {
        registerAliases(lang.aliases, { languageName });
      }
    }

    /**
     * Remove a language grammar module
     *
     * @param {string} languageName
     */
    function unregisterLanguage(languageName) {
      delete languages[languageName];
      for (const alias of Object.keys(aliases)) {
        if (aliases[alias] === languageName) {
          delete aliases[alias];
        }
      }
    }

    /**
     * @returns {string[]} List of language internal names
     */
    function listLanguages() {
      return Object.keys(languages);
    }

    /**
     * @param {string} name - name of the language to retrieve
     * @returns {Language | undefined}
     */
    function getLanguage(name) {
      name = (name || '').toLowerCase();
      return languages[name] || languages[aliases[name]];
    }

    /**
     *
     * @param {string|string[]} aliasList - single alias or list of aliases
     * @param {{languageName: string}} opts
     */
    function registerAliases(aliasList, { languageName }) {
      if (typeof aliasList === 'string') {
        aliasList = [aliasList];
      }
      aliasList.forEach(alias => { aliases[alias.toLowerCase()] = languageName; });
    }

    /**
     * Determines if a given language has auto-detection enabled
     * @param {string} name - name of the language
     */
    function autoDetection(name) {
      const lang = getLanguage(name);
      return lang && !lang.disableAutodetect;
    }

    /**
     * Upgrades the old highlightBlock plugins to the new
     * highlightElement API
     * @param {HLJSPlugin} plugin
     */
    function upgradePluginAPI(plugin) {
      // TODO: remove with v12
      if (plugin["before:highlightBlock"] && !plugin["before:highlightElement"]) {
        plugin["before:highlightElement"] = (data) => {
          plugin["before:highlightBlock"](
            Object.assign({ block: data.el }, data)
          );
        };
      }
      if (plugin["after:highlightBlock"] && !plugin["after:highlightElement"]) {
        plugin["after:highlightElement"] = (data) => {
          plugin["after:highlightBlock"](
            Object.assign({ block: data.el }, data)
          );
        };
      }
    }

    /**
     * @param {HLJSPlugin} plugin
     */
    function addPlugin(plugin) {
      upgradePluginAPI(plugin);
      plugins.push(plugin);
    }

    /**
     * @param {HLJSPlugin} plugin
     */
    function removePlugin(plugin) {
      const index = plugins.indexOf(plugin);
      if (index !== -1) {
        plugins.splice(index, 1);
      }
    }

    /**
     *
     * @param {PluginEvent} event
     * @param {any} args
     */
    function fire(event, args) {
      const cb = event;
      plugins.forEach(function(plugin) {
        if (plugin[cb]) {
          plugin[cb](args);
        }
      });
    }

    /**
     * DEPRECATED
     * @param {HighlightedHTMLElement} el
     */
    function deprecateHighlightBlock(el) {
      deprecated("10.7.0", "highlightBlock will be removed entirely in v12.0");
      deprecated("10.7.0", "Please use highlightElement now.");

      return highlightElement(el);
    }

    /* Interface definition */
    Object.assign(hljs, {
      highlight,
      highlightAuto,
      highlightAll,
      highlightElement,
      // TODO: Remove with v12 API
      highlightBlock: deprecateHighlightBlock,
      configure,
      initHighlighting,
      initHighlightingOnLoad,
      registerLanguage,
      unregisterLanguage,
      listLanguages,
      getLanguage,
      registerAliases,
      autoDetection,
      inherit,
      addPlugin,
      removePlugin
    });

    hljs.debugMode = function() { SAFE_MODE = false; };
    hljs.safeMode = function() { SAFE_MODE = true; };
    hljs.versionString = version;

    hljs.regex = {
      concat: concat,
      lookahead: lookahead,
      either: either,
      optional: optional,
      anyNumberOfTimes: anyNumberOfTimes
    };

    for (const key in MODES) {
      // @ts-ignore
      if (typeof MODES[key] === "object") {
        // @ts-ignore
        deepFreeze(MODES[key]);
      }
    }

    // merge all the modes/regexes into our main object
    Object.assign(hljs, MODES);

    return hljs;
  };

  // Other names for the variable may break build script
  const highlight = HLJS({});

  // returns a new instance of the highlighter to be used for extensions
  // check https://github.com/wooorm/lowlight/issues/47
  highlight.newInstance = () => HLJS({});

  return highlight;

})();
if (typeof exports === 'object' && typeof module !== 'undefined') { module.exports = hljs; }
/*! `accesslog` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
   Language: Apache Access Log
   Author: Oleg Efimov <efimovov@gmail.com>
   Description: Apache/Nginx Access Logs
   Website: https://httpd.apache.org/docs/2.4/logs.html#accesslog
   Category: web, logs
   Audit: 2020
   */

  /** @type LanguageFn */
  function accesslog(hljs) {
    const regex = hljs.regex;
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods
    const HTTP_VERBS = [
      "GET",
      "POST",
      "HEAD",
      "PUT",
      "DELETE",
      "CONNECT",
      "OPTIONS",
      "PATCH",
      "TRACE"
    ];
    return {
      name: 'Apache Access Log',
      contains: [
        // IP
        {
          className: 'number',
          begin: /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d{1,5})?\b/,
          relevance: 5
        },
        // Other numbers
        {
          className: 'number',
          begin: /\b\d+\b/,
          relevance: 0
        },
        // Requests
        {
          className: 'string',
          begin: regex.concat(/"/, regex.either(...HTTP_VERBS)),
          end: /"/,
          keywords: HTTP_VERBS,
          illegal: /\n/,
          relevance: 5,
          contains: [
            {
              begin: /HTTP\/[12]\.\d'/,
              relevance: 5
            }
          ]
        },
        // Dates
        {
          className: 'string',
          // dates must have a certain length, this prevents matching
          // simple array accesses a[123] and [] and other common patterns
          // found in other languages
          begin: /\[\d[^\]\n]{8,}\]/,
          illegal: /\n/,
          relevance: 1
        },
        {
          className: 'string',
          begin: /\[/,
          end: /\]/,
          illegal: /\n/,
          relevance: 0
        },
        // User agent / relevance boost
        {
          className: 'string',
          begin: /"Mozilla\/\d\.\d \(/,
          end: /"/,
          illegal: /\n/,
          relevance: 3
        },
        // Strings
        {
          className: 'string',
          begin: /"/,
          end: /"/,
          illegal: /\n/,
          relevance: 0
        }
      ]
    };
  }

  return accesslog;

})();

    hljs.registerLanguage('accesslog', hljsGrammar);
  })();/*! `actionscript` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: ActionScript
  Author: Alexander Myadzel <myadzel@gmail.com>
  Category: scripting
  Audit: 2020
  */

  /** @type LanguageFn */
  function actionscript(hljs) {
    const regex = hljs.regex;
    const IDENT_RE = /[a-zA-Z_$][a-zA-Z0-9_$]*/;
    const PKG_NAME_RE = regex.concat(
      IDENT_RE,
      regex.concat("(\\.", IDENT_RE, ")*")
    );
    const IDENT_FUNC_RETURN_TYPE_RE = /([*]|[a-zA-Z_$][a-zA-Z0-9_$]*)/;

    const AS3_REST_ARG_MODE = {
      className: 'rest_arg',
      begin: /[.]{3}/,
      end: IDENT_RE,
      relevance: 10
    };

    const KEYWORDS = [
      "as",
      "break",
      "case",
      "catch",
      "class",
      "const",
      "continue",
      "default",
      "delete",
      "do",
      "dynamic",
      "each",
      "else",
      "extends",
      "final",
      "finally",
      "for",
      "function",
      "get",
      "if",
      "implements",
      "import",
      "in",
      "include",
      "instanceof",
      "interface",
      "internal",
      "is",
      "namespace",
      "native",
      "new",
      "override",
      "package",
      "private",
      "protected",
      "public",
      "return",
      "set",
      "static",
      "super",
      "switch",
      "this",
      "throw",
      "try",
      "typeof",
      "use",
      "var",
      "void",
      "while",
      "with"
    ];
    const LITERALS = [
      "true",
      "false",
      "null",
      "undefined"
    ];

    return {
      name: 'ActionScript',
      aliases: [ 'as' ],
      keywords: {
        keyword: KEYWORDS,
        literal: LITERALS
      },
      contains: [
        hljs.APOS_STRING_MODE,
        hljs.QUOTE_STRING_MODE,
        hljs.C_LINE_COMMENT_MODE,
        hljs.C_BLOCK_COMMENT_MODE,
        hljs.C_NUMBER_MODE,
        {
          match: [
            /\bpackage/,
            /\s+/,
            PKG_NAME_RE
          ],
          className: {
            1: "keyword",
            3: "title.class"
          }
        },
        {
          match: [
            /\b(?:class|interface|extends|implements)/,
            /\s+/,
            IDENT_RE
          ],
          className: {
            1: "keyword",
            3: "title.class"
          }
        },
        {
          className: 'meta',
          beginKeywords: 'import include',
          end: /;/,
          keywords: { keyword: 'import include' }
        },
        {
          beginKeywords: 'function',
          end: /[{;]/,
          excludeEnd: true,
          illegal: /\S/,
          contains: [
            hljs.inherit(hljs.TITLE_MODE, { className: "title.function" }),
            {
              className: 'params',
              begin: /\(/,
              end: /\)/,
              contains: [
                hljs.APOS_STRING_MODE,
                hljs.QUOTE_STRING_MODE,
                hljs.C_LINE_COMMENT_MODE,
                hljs.C_BLOCK_COMMENT_MODE,
                AS3_REST_ARG_MODE
              ]
            },
            { begin: regex.concat(/:\s*/, IDENT_FUNC_RETURN_TYPE_RE) }
          ]
        },
        hljs.METHOD_GUARD
      ],
      illegal: /#/
    };
  }

  return actionscript;

})();

    hljs.registerLanguage('actionscript', hljsGrammar);
  })();/*! `apache` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Apache config
  Author: Ruslan Keba <rukeba@gmail.com>
  Contributors: Ivan Sagalaev <maniac@softwaremaniacs.org>
  Website: https://httpd.apache.org
  Description: language definition for Apache configuration files (httpd.conf & .htaccess)
  Category: config, web
  Audit: 2020
  */

  /** @type LanguageFn */
  function apache(hljs) {
    const NUMBER_REF = {
      className: 'number',
      begin: /[$%]\d+/
    };
    const NUMBER = {
      className: 'number',
      begin: /\b\d+/
    };
    const IP_ADDRESS = {
      className: "number",
      begin: /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d{1,5})?/
    };
    const PORT_NUMBER = {
      className: "number",
      begin: /:\d{1,5}/
    };
    return {
      name: 'Apache config',
      aliases: [ 'apacheconf' ],
      case_insensitive: true,
      contains: [
        hljs.HASH_COMMENT_MODE,
        {
          className: 'section',
          begin: /<\/?/,
          end: />/,
          contains: [
            IP_ADDRESS,
            PORT_NUMBER,
            // low relevance prevents us from claming XML/HTML where this rule would
            // match strings inside of XML tags
            hljs.inherit(hljs.QUOTE_STRING_MODE, { relevance: 0 })
          ]
        },
        {
          className: 'attribute',
          begin: /\w+/,
          relevance: 0,
          // keywords aren’t needed for highlighting per se, they only boost relevance
          // for a very generally defined mode (starts with a word, ends with line-end
          keywords: { _: [
            "order",
            "deny",
            "allow",
            "setenv",
            "rewriterule",
            "rewriteengine",
            "rewritecond",
            "documentroot",
            "sethandler",
            "errordocument",
            "loadmodule",
            "options",
            "header",
            "listen",
            "serverroot",
            "servername"
          ] },
          starts: {
            end: /$/,
            relevance: 0,
            keywords: { literal: 'on off all deny allow' },
            contains: [
              {
                scope: "punctuation",
                match: /\\\n/
              },
              {
                className: 'meta',
                begin: /\s\[/,
                end: /\]$/
              },
              {
                className: 'variable',
                begin: /[\$%]\{/,
                end: /\}/,
                contains: [
                  'self',
                  NUMBER_REF
                ]
              },
              IP_ADDRESS,
              NUMBER,
              hljs.QUOTE_STRING_MODE
            ]
          }
        }
      ],
      illegal: /\S/
    };
  }

  return apache;

})();

    hljs.registerLanguage('apache', hljsGrammar);
  })();/*! `arduino` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: C++
  Category: common, system
  Website: https://isocpp.org
  */

  /** @type LanguageFn */
  function cPlusPlus(hljs) {
    const regex = hljs.regex;
    // added for historic reasons because `hljs.C_LINE_COMMENT_MODE` does
    // not include such support nor can we be sure all the grammars depending
    // on it would desire this behavior
    const C_LINE_COMMENT_MODE = hljs.COMMENT('//', '$', { contains: [ { begin: /\\\n/ } ] });
    const DECLTYPE_AUTO_RE = 'decltype\\(auto\\)';
    const NAMESPACE_RE = '[a-zA-Z_]\\w*::';
    const TEMPLATE_ARGUMENT_RE = '<[^<>]+>';
    const FUNCTION_TYPE_RE = '(?!struct)('
      + DECLTYPE_AUTO_RE + '|'
      + regex.optional(NAMESPACE_RE)
      + '[a-zA-Z_]\\w*' + regex.optional(TEMPLATE_ARGUMENT_RE)
    + ')';

    const CPP_PRIMITIVE_TYPES = {
      className: 'type',
      begin: '\\b[a-z\\d_]*_t\\b'
    };

    // https://en.cppreference.com/w/cpp/language/escape
    // \\ \x \xFF \u2837 \u00323747 \374
    const CHARACTER_ESCAPES = '\\\\(x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{4,8}|[0-7]{3}|\\S)';
    const STRINGS = {
      className: 'string',
      variants: [
        {
          begin: '(u8?|U|L)?"',
          end: '"',
          illegal: '\\n',
          contains: [ hljs.BACKSLASH_ESCAPE ]
        },
        {
          begin: '(u8?|U|L)?\'(' + CHARACTER_ESCAPES + '|.)',
          end: '\'',
          illegal: '.'
        },
        hljs.END_SAME_AS_BEGIN({
          begin: /(?:u8?|U|L)?R"([^()\\ ]{0,16})\(/,
          end: /\)([^()\\ ]{0,16})"/
        })
      ]
    };

    const NUMBERS = {
      className: 'number',
      variants: [
        // Floating-point literal.
        { begin:
          "[+-]?(?:" // Leading sign.
            // Decimal.
            + "(?:"
              +"[0-9](?:'?[0-9])*\\.(?:[0-9](?:'?[0-9])*)?"
              + "|\\.[0-9](?:'?[0-9])*"
            + ")(?:[Ee][+-]?[0-9](?:'?[0-9])*)?"
            + "|[0-9](?:'?[0-9])*[Ee][+-]?[0-9](?:'?[0-9])*"
            // Hexadecimal.
            + "|0[Xx](?:"
              +"[0-9A-Fa-f](?:'?[0-9A-Fa-f])*(?:\\.(?:[0-9A-Fa-f](?:'?[0-9A-Fa-f])*)?)?"
              + "|\\.[0-9A-Fa-f](?:'?[0-9A-Fa-f])*"
            + ")[Pp][+-]?[0-9](?:'?[0-9])*"
          + ")(?:" // Literal suffixes.
            + "[Ff](?:16|32|64|128)?"
            + "|(BF|bf)16"
            + "|[Ll]"
            + "|" // Literal suffix is optional.
          + ")"
        },
        // Integer literal.
        { begin:
          "[+-]?\\b(?:" // Leading sign.
            + "0[Bb][01](?:'?[01])*" // Binary.
            + "|0[Xx][0-9A-Fa-f](?:'?[0-9A-Fa-f])*" // Hexadecimal.
            + "|0(?:'?[0-7])*" // Octal or just a lone zero.
            + "|[1-9](?:'?[0-9])*" // Decimal.
          + ")(?:" // Literal suffixes.
            + "[Uu](?:LL?|ll?)"
            + "|[Uu][Zz]?"
            + "|(?:LL?|ll?)[Uu]?"
            + "|[Zz][Uu]"
            + "|" // Literal suffix is optional.
          + ")"
          // Note: there are user-defined literal suffixes too, but perhaps having the custom suffix not part of the
          // literal highlight actually makes it stand out more.
        }
      ],
      relevance: 0
    };

    const PREPROCESSOR = {
      className: 'meta',
      begin: /#\s*[a-z]+\b/,
      end: /$/,
      keywords: { keyword:
          'if else elif endif define undef warning error line '
          + 'pragma _Pragma ifdef ifndef include' },
      contains: [
        {
          begin: /\\\n/,
          relevance: 0
        },
        hljs.inherit(STRINGS, { className: 'string' }),
        {
          className: 'string',
          begin: /<.*?>/
        },
        C_LINE_COMMENT_MODE,
        hljs.C_BLOCK_COMMENT_MODE
      ]
    };

    const TITLE_MODE = {
      className: 'title',
      begin: regex.optional(NAMESPACE_RE) + hljs.IDENT_RE,
      relevance: 0
    };

    const FUNCTION_TITLE = regex.optional(NAMESPACE_RE) + hljs.IDENT_RE + '\\s*\\(';

    // https://en.cppreference.com/w/cpp/keyword
    const RESERVED_KEYWORDS = [
      'alignas',
      'alignof',
      'and',
      'and_eq',
      'asm',
      'atomic_cancel',
      'atomic_commit',
      'atomic_noexcept',
      'auto',
      'bitand',
      'bitor',
      'break',
      'case',
      'catch',
      'class',
      'co_await',
      'co_return',
      'co_yield',
      'compl',
      'concept',
      'const_cast|10',
      'consteval',
      'constexpr',
      'constinit',
      'continue',
      'decltype',
      'default',
      'delete',
      'do',
      'dynamic_cast|10',
      'else',
      'enum',
      'explicit',
      'export',
      'extern',
      'false',
      'final',
      'for',
      'friend',
      'goto',
      'if',
      'import',
      'inline',
      'module',
      'mutable',
      'namespace',
      'new',
      'noexcept',
      'not',
      'not_eq',
      'nullptr',
      'operator',
      'or',
      'or_eq',
      'override',
      'private',
      'protected',
      'public',
      'reflexpr',
      'register',
      'reinterpret_cast|10',
      'requires',
      'return',
      'sizeof',
      'static_assert',
      'static_cast|10',
      'struct',
      'switch',
      'synchronized',
      'template',
      'this',
      'thread_local',
      'throw',
      'transaction_safe',
      'transaction_safe_dynamic',
      'true',
      'try',
      'typedef',
      'typeid',
      'typename',
      'union',
      'using',
      'virtual',
      'volatile',
      'while',
      'xor',
      'xor_eq'
    ];

    // https://en.cppreference.com/w/cpp/keyword
    const RESERVED_TYPES = [
      'bool',
      'char',
      'char16_t',
      'char32_t',
      'char8_t',
      'double',
      'float',
      'int',
      'long',
      'short',
      'void',
      'wchar_t',
      'unsigned',
      'signed',
      'const',
      'static'
    ];

    const TYPE_HINTS = [
      'any',
      'auto_ptr',
      'barrier',
      'binary_semaphore',
      'bitset',
      'complex',
      'condition_variable',
      'condition_variable_any',
      'counting_semaphore',
      'deque',
      'false_type',
      'flat_map',
      'flat_set',
      'future',
      'imaginary',
      'initializer_list',
      'istringstream',
      'jthread',
      'latch',
      'lock_guard',
      'multimap',
      'multiset',
      'mutex',
      'optional',
      'ostringstream',
      'packaged_task',
      'pair',
      'promise',
      'priority_queue',
      'queue',
      'recursive_mutex',
      'recursive_timed_mutex',
      'scoped_lock',
      'set',
      'shared_future',
      'shared_lock',
      'shared_mutex',
      'shared_timed_mutex',
      'shared_ptr',
      'stack',
      'string_view',
      'stringstream',
      'timed_mutex',
      'thread',
      'true_type',
      'tuple',
      'unique_lock',
      'unique_ptr',
      'unordered_map',
      'unordered_multimap',
      'unordered_multiset',
      'unordered_set',
      'variant',
      'vector',
      'weak_ptr',
      'wstring',
      'wstring_view'
    ];

    const FUNCTION_HINTS = [
      'abort',
      'abs',
      'acos',
      'apply',
      'as_const',
      'asin',
      'atan',
      'atan2',
      'calloc',
      'ceil',
      'cerr',
      'cin',
      'clog',
      'cos',
      'cosh',
      'cout',
      'declval',
      'endl',
      'exchange',
      'exit',
      'exp',
      'fabs',
      'floor',
      'fmod',
      'forward',
      'fprintf',
      'fputs',
      'free',
      'frexp',
      'fscanf',
      'future',
      'invoke',
      'isalnum',
      'isalpha',
      'iscntrl',
      'isdigit',
      'isgraph',
      'islower',
      'isprint',
      'ispunct',
      'isspace',
      'isupper',
      'isxdigit',
      'labs',
      'launder',
      'ldexp',
      'log',
      'log10',
      'make_pair',
      'make_shared',
      'make_shared_for_overwrite',
      'make_tuple',
      'make_unique',
      'malloc',
      'memchr',
      'memcmp',
      'memcpy',
      'memset',
      'modf',
      'move',
      'pow',
      'printf',
      'putchar',
      'puts',
      'realloc',
      'scanf',
      'sin',
      'sinh',
      'snprintf',
      'sprintf',
      'sqrt',
      'sscanf',
      'std',
      'stderr',
      'stdin',
      'stdout',
      'strcat',
      'strchr',
      'strcmp',
      'strcpy',
      'strcspn',
      'strlen',
      'strncat',
      'strncmp',
      'strncpy',
      'strpbrk',
      'strrchr',
      'strspn',
      'strstr',
      'swap',
      'tan',
      'tanh',
      'terminate',
      'to_underlying',
      'tolower',
      'toupper',
      'vfprintf',
      'visit',
      'vprintf',
      'vsprintf'
    ];

    const LITERALS = [
      'NULL',
      'false',
      'nullopt',
      'nullptr',
      'true'
    ];

    // https://en.cppreference.com/w/cpp/keyword
    const BUILT_IN = [ '_Pragma' ];

    const CPP_KEYWORDS = {
      type: RESERVED_TYPES,
      keyword: RESERVED_KEYWORDS,
      literal: LITERALS,
      built_in: BUILT_IN,
      _type_hints: TYPE_HINTS
    };

    const FUNCTION_DISPATCH = {
      className: 'function.dispatch',
      relevance: 0,
      keywords: {
        // Only for relevance, not highlighting.
        _hint: FUNCTION_HINTS },
      begin: regex.concat(
        /\b/,
        /(?!decltype)/,
        /(?!if)/,
        /(?!for)/,
        /(?!switch)/,
        /(?!while)/,
        hljs.IDENT_RE,
        regex.lookahead(/(<[^<>]+>|)\s*\(/))
    };

    const EXPRESSION_CONTAINS = [
      FUNCTION_DISPATCH,
      PREPROCESSOR,
      CPP_PRIMITIVE_TYPES,
      C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      NUMBERS,
      STRINGS
    ];

    const EXPRESSION_CONTEXT = {
      // This mode covers expression context where we can't expect a function
      // definition and shouldn't highlight anything that looks like one:
      // `return some()`, `else if()`, `(x*sum(1, 2))`
      variants: [
        {
          begin: /=/,
          end: /;/
        },
        {
          begin: /\(/,
          end: /\)/
        },
        {
          beginKeywords: 'new throw return else',
          end: /;/
        }
      ],
      keywords: CPP_KEYWORDS,
      contains: EXPRESSION_CONTAINS.concat([
        {
          begin: /\(/,
          end: /\)/,
          keywords: CPP_KEYWORDS,
          contains: EXPRESSION_CONTAINS.concat([ 'self' ]),
          relevance: 0
        }
      ]),
      relevance: 0
    };

    const FUNCTION_DECLARATION = {
      className: 'function',
      begin: '(' + FUNCTION_TYPE_RE + '[\\*&\\s]+)+' + FUNCTION_TITLE,
      returnBegin: true,
      end: /[{;=]/,
      excludeEnd: true,
      keywords: CPP_KEYWORDS,
      illegal: /[^\w\s\*&:<>.]/,
      contains: [
        { // to prevent it from being confused as the function title
          begin: DECLTYPE_AUTO_RE,
          keywords: CPP_KEYWORDS,
          relevance: 0
        },
        {
          begin: FUNCTION_TITLE,
          returnBegin: true,
          contains: [ TITLE_MODE ],
          relevance: 0
        },
        // needed because we do not have look-behind on the below rule
        // to prevent it from grabbing the final : in a :: pair
        {
          begin: /::/,
          relevance: 0
        },
        // initializers
        {
          begin: /:/,
          endsWithParent: true,
          contains: [
            STRINGS,
            NUMBERS
          ]
        },
        // allow for multiple declarations, e.g.:
        // extern void f(int), g(char);
        {
          relevance: 0,
          match: /,/
        },
        {
          className: 'params',
          begin: /\(/,
          end: /\)/,
          keywords: CPP_KEYWORDS,
          relevance: 0,
          contains: [
            C_LINE_COMMENT_MODE,
            hljs.C_BLOCK_COMMENT_MODE,
            STRINGS,
            NUMBERS,
            CPP_PRIMITIVE_TYPES,
            // Count matching parentheses.
            {
              begin: /\(/,
              end: /\)/,
              keywords: CPP_KEYWORDS,
              relevance: 0,
              contains: [
                'self',
                C_LINE_COMMENT_MODE,
                hljs.C_BLOCK_COMMENT_MODE,
                STRINGS,
                NUMBERS,
                CPP_PRIMITIVE_TYPES
              ]
            }
          ]
        },
        CPP_PRIMITIVE_TYPES,
        C_LINE_COMMENT_MODE,
        hljs.C_BLOCK_COMMENT_MODE,
        PREPROCESSOR
      ]
    };

    return {
      name: 'C++',
      aliases: [
        'cc',
        'c++',
        'h++',
        'hpp',
        'hh',
        'hxx',
        'cxx'
      ],
      keywords: CPP_KEYWORDS,
      illegal: '</',
      classNameAliases: { 'function.dispatch': 'built_in' },
      contains: [].concat(
        EXPRESSION_CONTEXT,
        FUNCTION_DECLARATION,
        FUNCTION_DISPATCH,
        EXPRESSION_CONTAINS,
        [
          PREPROCESSOR,
          { // containers: ie, `vector <int> rooms (9);`
            begin: '\\b(deque|list|queue|priority_queue|pair|stack|vector|map|set|bitset|multiset|multimap|unordered_map|unordered_set|unordered_multiset|unordered_multimap|array|tuple|optional|variant|function|flat_map|flat_set)\\s*<(?!<)',
            end: '>',
            keywords: CPP_KEYWORDS,
            contains: [
              'self',
              CPP_PRIMITIVE_TYPES
            ]
          },
          {
            begin: hljs.IDENT_RE + '::',
            keywords: CPP_KEYWORDS
          },
          {
            match: [
              // extra complexity to deal with `enum class` and `enum struct`
              /\b(?:enum(?:\s+(?:class|struct))?|class|struct|union)/,
              /\s+/,
              /\w+/
            ],
            className: {
              1: 'keyword',
              3: 'title.class'
            }
          }
        ])
    };
  }

  /*
  Language: Arduino
  Author: Stefania Mellai <s.mellai@arduino.cc>
  Description: The Arduino® Language is a superset of C++. This rules are designed to highlight the Arduino® source code. For info about language see http://www.arduino.cc.
  Website: https://www.arduino.cc
  Category: system
  */


  /** @type LanguageFn */
  function arduino(hljs) {
    const ARDUINO_KW = {
      type: [
        "boolean",
        "byte",
        "word",
        "String"
      ],
      built_in: [
        "KeyboardController",
        "MouseController",
        "SoftwareSerial",
        "EthernetServer",
        "EthernetClient",
        "LiquidCrystal",
        "RobotControl",
        "GSMVoiceCall",
        "EthernetUDP",
        "EsploraTFT",
        "HttpClient",
        "RobotMotor",
        "WiFiClient",
        "GSMScanner",
        "FileSystem",
        "Scheduler",
        "GSMServer",
        "YunClient",
        "YunServer",
        "IPAddress",
        "GSMClient",
        "GSMModem",
        "Keyboard",
        "Ethernet",
        "Console",
        "GSMBand",
        "Esplora",
        "Stepper",
        "Process",
        "WiFiUDP",
        "GSM_SMS",
        "Mailbox",
        "USBHost",
        "Firmata",
        "PImage",
        "Client",
        "Server",
        "GSMPIN",
        "FileIO",
        "Bridge",
        "Serial",
        "EEPROM",
        "Stream",
        "Mouse",
        "Audio",
        "Servo",
        "File",
        "Task",
        "GPRS",
        "WiFi",
        "Wire",
        "TFT",
        "GSM",
        "SPI",
        "SD"
      ],
      _hints: [
        "setup",
        "loop",
        "runShellCommandAsynchronously",
        "analogWriteResolution",
        "retrieveCallingNumber",
        "printFirmwareVersion",
        "analogReadResolution",
        "sendDigitalPortPair",
        "noListenOnLocalhost",
        "readJoystickButton",
        "setFirmwareVersion",
        "readJoystickSwitch",
        "scrollDisplayRight",
        "getVoiceCallStatus",
        "scrollDisplayLeft",
        "writeMicroseconds",
        "delayMicroseconds",
        "beginTransmission",
        "getSignalStrength",
        "runAsynchronously",
        "getAsynchronously",
        "listenOnLocalhost",
        "getCurrentCarrier",
        "readAccelerometer",
        "messageAvailable",
        "sendDigitalPorts",
        "lineFollowConfig",
        "countryNameWrite",
        "runShellCommand",
        "readStringUntil",
        "rewindDirectory",
        "readTemperature",
        "setClockDivider",
        "readLightSensor",
        "endTransmission",
        "analogReference",
        "detachInterrupt",
        "countryNameRead",
        "attachInterrupt",
        "encryptionType",
        "readBytesUntil",
        "robotNameWrite",
        "readMicrophone",
        "robotNameRead",
        "cityNameWrite",
        "userNameWrite",
        "readJoystickY",
        "readJoystickX",
        "mouseReleased",
        "openNextFile",
        "scanNetworks",
        "noInterrupts",
        "digitalWrite",
        "beginSpeaker",
        "mousePressed",
        "isActionDone",
        "mouseDragged",
        "displayLogos",
        "noAutoscroll",
        "addParameter",
        "remoteNumber",
        "getModifiers",
        "keyboardRead",
        "userNameRead",
        "waitContinue",
        "processInput",
        "parseCommand",
        "printVersion",
        "readNetworks",
        "writeMessage",
        "blinkVersion",
        "cityNameRead",
        "readMessage",
        "setDataMode",
        "parsePacket",
        "isListening",
        "setBitOrder",
        "beginPacket",
        "isDirectory",
        "motorsWrite",
        "drawCompass",
        "digitalRead",
        "clearScreen",
        "serialEvent",
        "rightToLeft",
        "setTextSize",
        "leftToRight",
        "requestFrom",
        "keyReleased",
        "compassRead",
        "analogWrite",
        "interrupts",
        "WiFiServer",
        "disconnect",
        "playMelody",
        "parseFloat",
        "autoscroll",
        "getPINUsed",
        "setPINUsed",
        "setTimeout",
        "sendAnalog",
        "readSlider",
        "analogRead",
        "beginWrite",
        "createChar",
        "motorsStop",
        "keyPressed",
        "tempoWrite",
        "readButton",
        "subnetMask",
        "debugPrint",
        "macAddress",
        "writeGreen",
        "randomSeed",
        "attachGPRS",
        "readString",
        "sendString",
        "remotePort",
        "releaseAll",
        "mouseMoved",
        "background",
        "getXChange",
        "getYChange",
        "answerCall",
        "getResult",
        "voiceCall",
        "endPacket",
        "constrain",
        "getSocket",
        "writeJSON",
        "getButton",
        "available",
        "connected",
        "findUntil",
        "readBytes",
        "exitValue",
        "readGreen",
        "writeBlue",
        "startLoop",
        "IPAddress",
        "isPressed",
        "sendSysex",
        "pauseMode",
        "gatewayIP",
        "setCursor",
        "getOemKey",
        "tuneWrite",
        "noDisplay",
        "loadImage",
        "switchPIN",
        "onRequest",
        "onReceive",
        "changePIN",
        "playFile",
        "noBuffer",
        "parseInt",
        "overflow",
        "checkPIN",
        "knobRead",
        "beginTFT",
        "bitClear",
        "updateIR",
        "bitWrite",
        "position",
        "writeRGB",
        "highByte",
        "writeRed",
        "setSpeed",
        "readBlue",
        "noStroke",
        "remoteIP",
        "transfer",
        "shutdown",
        "hangCall",
        "beginSMS",
        "endWrite",
        "attached",
        "maintain",
        "noCursor",
        "checkReg",
        "checkPUK",
        "shiftOut",
        "isValid",
        "shiftIn",
        "pulseIn",
        "connect",
        "println",
        "localIP",
        "pinMode",
        "getIMEI",
        "display",
        "noBlink",
        "process",
        "getBand",
        "running",
        "beginSD",
        "drawBMP",
        "lowByte",
        "setBand",
        "release",
        "bitRead",
        "prepare",
        "pointTo",
        "readRed",
        "setMode",
        "noFill",
        "remove",
        "listen",
        "stroke",
        "detach",
        "attach",
        "noTone",
        "exists",
        "buffer",
        "height",
        "bitSet",
        "circle",
        "config",
        "cursor",
        "random",
        "IRread",
        "setDNS",
        "endSMS",
        "getKey",
        "micros",
        "millis",
        "begin",
        "print",
        "write",
        "ready",
        "flush",
        "width",
        "isPIN",
        "blink",
        "clear",
        "press",
        "mkdir",
        "rmdir",
        "close",
        "point",
        "yield",
        "image",
        "BSSID",
        "click",
        "delay",
        "read",
        "text",
        "move",
        "peek",
        "beep",
        "rect",
        "line",
        "open",
        "seek",
        "fill",
        "size",
        "turn",
        "stop",
        "home",
        "find",
        "step",
        "tone",
        "sqrt",
        "RSSI",
        "SSID",
        "end",
        "bit",
        "tan",
        "cos",
        "sin",
        "pow",
        "map",
        "abs",
        "max",
        "min",
        "get",
        "run",
        "put"
      ],
      literal: [
        "DIGITAL_MESSAGE",
        "FIRMATA_STRING",
        "ANALOG_MESSAGE",
        "REPORT_DIGITAL",
        "REPORT_ANALOG",
        "INPUT_PULLUP",
        "SET_PIN_MODE",
        "INTERNAL2V56",
        "SYSTEM_RESET",
        "LED_BUILTIN",
        "INTERNAL1V1",
        "SYSEX_START",
        "INTERNAL",
        "EXTERNAL",
        "DEFAULT",
        "OUTPUT",
        "INPUT",
        "HIGH",
        "LOW"
      ]
    };

    const ARDUINO = cPlusPlus(hljs);

    const kws = /** @type {Record<string,any>} */ (ARDUINO.keywords);

    kws.type = [
      ...kws.type,
      ...ARDUINO_KW.type
    ];
    kws.literal = [
      ...kws.literal,
      ...ARDUINO_KW.literal
    ];
    kws.built_in = [
      ...kws.built_in,
      ...ARDUINO_KW.built_in
    ];
    kws._hints = ARDUINO_KW._hints;

    ARDUINO.name = 'Arduino';
    ARDUINO.aliases = [ 'ino' ];
    ARDUINO.supersetOf = "cpp";

    return ARDUINO;
  }

  return arduino;

})();

    hljs.registerLanguage('arduino', hljsGrammar);
  })();/*! `asciidoc` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: AsciiDoc
  Requires: xml.js
  Author: Dan Allen <dan.j.allen@gmail.com>
  Website: http://asciidoc.org
  Description: A semantic, text-based document format that can be exported to HTML, DocBook and other backends.
  Category: markup
  */

  /** @type LanguageFn */
  function asciidoc(hljs) {
    const regex = hljs.regex;
    const HORIZONTAL_RULE = {
      begin: '^\'{3,}[ \\t]*$',
      relevance: 10
    };
    const ESCAPED_FORMATTING = [
      // escaped constrained formatting marks (i.e., \* \_ or \`)
      { begin: /\\[*_`]/ },
      // escaped unconstrained formatting marks (i.e., \\** \\__ or \\``)
      // must ignore until the next formatting marks
      // this rule might not be 100% compliant with Asciidoctor 2.0 but we are entering undefined behavior territory...
      { begin: /\\\\\*{2}[^\n]*?\*{2}/ },
      { begin: /\\\\_{2}[^\n]*_{2}/ },
      { begin: /\\\\`{2}[^\n]*`{2}/ },
      // guard: constrained formatting mark may not be preceded by ":", ";" or
      // "}". match these so the constrained rule doesn't see them
      { begin: /[:;}][*_`](?![*_`])/ }
    ];
    const STRONG = [
      // inline unconstrained strong (single line)
      {
        className: 'strong',
        begin: /\*{2}([^\n]+?)\*{2}/
      },
      // inline unconstrained strong (multi-line)
      {
        className: 'strong',
        begin: regex.concat(
          /\*\*/,
          /((\*(?!\*)|\\[^\n]|[^*\n\\])+\n)+/,
          /(\*(?!\*)|\\[^\n]|[^*\n\\])*/,
          /\*\*/
        ),
        relevance: 0
      },
      // inline constrained strong (single line)
      {
        className: 'strong',
        // must not precede or follow a word character
        begin: /\B\*(\S|\S[^\n]*?\S)\*(?!\w)/
      },
      // inline constrained strong (multi-line)
      {
        className: 'strong',
        // must not precede or follow a word character
        begin: /\*[^\s]([^\n]+\n)+([^\n]+)\*/
      }
    ];
    const EMPHASIS = [
      // inline unconstrained emphasis (single line)
      {
        className: 'emphasis',
        begin: /_{2}([^\n]+?)_{2}/
      },
      // inline unconstrained emphasis (multi-line)
      {
        className: 'emphasis',
        begin: regex.concat(
          /__/,
          /((_(?!_)|\\[^\n]|[^_\n\\])+\n)+/,
          /(_(?!_)|\\[^\n]|[^_\n\\])*/,
          /__/
        ),
        relevance: 0
      },
      // inline constrained emphasis (single line)
      {
        className: 'emphasis',
        // must not precede or follow a word character
        begin: /\b_(\S|\S[^\n]*?\S)_(?!\w)/
      },
      // inline constrained emphasis (multi-line)
      {
        className: 'emphasis',
        // must not precede or follow a word character
        begin: /_[^\s]([^\n]+\n)+([^\n]+)_/
      },
      // inline constrained emphasis using single quote (legacy)
      {
        className: 'emphasis',
        // must not follow a word character or be followed by a single quote or space
        begin: '\\B\'(?![\'\\s])',
        end: '(\\n{2}|\')',
        // allow escaped single quote followed by word char
        contains: [
          {
            begin: '\\\\\'\\w',
            relevance: 0
          }
        ],
        relevance: 0
      }
    ];
    const ADMONITION = {
      className: 'symbol',
      begin: '^(NOTE|TIP|IMPORTANT|WARNING|CAUTION):\\s+',
      relevance: 10
    };
    const BULLET_LIST = {
      className: 'bullet',
      begin: '^(\\*+|-+|\\.+|[^\\n]+?::)\\s+'
    };

    return {
      name: 'AsciiDoc',
      aliases: [ 'adoc' ],
      contains: [
        // block comment
        hljs.COMMENT(
          '^/{4,}\\n',
          '\\n/{4,}$',
          // can also be done as...
          // '^/{4,}$',
          // '^/{4,}$',
          { relevance: 10 }
        ),
        // line comment
        hljs.COMMENT(
          '^//',
          '$',
          { relevance: 0 }
        ),
        // title
        {
          className: 'title',
          begin: '^\\.\\w.*$'
        },
        // example, admonition & sidebar blocks
        {
          begin: '^[=\\*]{4,}\\n',
          end: '\\n^[=\\*]{4,}$',
          relevance: 10
        },
        // headings
        {
          className: 'section',
          relevance: 10,
          variants: [
            { begin: '^(={1,6})[ \t].+?([ \t]\\1)?$' },
            { begin: '^[^\\[\\]\\n]+?\\n[=\\-~\\^\\+]{2,}$' }
          ]
        },
        // document attributes
        {
          className: 'meta',
          begin: '^:.+?:',
          end: '\\s',
          excludeEnd: true,
          relevance: 10
        },
        // block attributes
        {
          className: 'meta',
          begin: '^\\[.+?\\]$',
          relevance: 0
        },
        // quoteblocks
        {
          className: 'quote',
          begin: '^_{4,}\\n',
          end: '\\n_{4,}$',
          relevance: 10
        },
        // listing and literal blocks
        {
          className: 'code',
          begin: '^[\\-\\.]{4,}\\n',
          end: '\\n[\\-\\.]{4,}$',
          relevance: 10
        },
        // passthrough blocks
        {
          begin: '^\\+{4,}\\n',
          end: '\\n\\+{4,}$',
          contains: [
            {
              begin: '<',
              end: '>',
              subLanguage: 'xml',
              relevance: 0
            }
          ],
          relevance: 10
        },

        BULLET_LIST,
        ADMONITION,
        ...ESCAPED_FORMATTING,
        ...STRONG,
        ...EMPHASIS,

        // inline smart quotes
        {
          className: 'string',
          variants: [
            { begin: "``.+?''" },
            { begin: "`.+?'" }
          ]
        },
        // inline unconstrained emphasis
        {
          className: 'code',
          begin: /`{2}/,
          end: /(\n{2}|`{2})/
        },
        // inline code snippets (TODO should get same treatment as strong and emphasis)
        {
          className: 'code',
          begin: '(`.+?`|\\+.+?\\+)',
          relevance: 0
        },
        // indented literal block
        {
          className: 'code',
          begin: '^[ \\t]',
          end: '$',
          relevance: 0
        },
        HORIZONTAL_RULE,
        // images and links
        {
          begin: '(link:)?(http|https|ftp|file|irc|image:?):\\S+?\\[[^[]*?\\]',
          returnBegin: true,
          contains: [
            {
              begin: '(link|image:?):',
              relevance: 0
            },
            {
              className: 'link',
              begin: '\\w',
              end: '[^\\[]+',
              relevance: 0
            },
            {
              className: 'string',
              begin: '\\[',
              end: '\\]',
              excludeBegin: true,
              excludeEnd: true,
              relevance: 0
            }
          ],
          relevance: 10
        }
      ]
    };
  }

  return asciidoc;

})();

    hljs.registerLanguage('asciidoc', hljsGrammar);
  })();/*! `awk` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Awk
  Author: Matthew Daly <matthewbdaly@gmail.com>
  Website: https://www.gnu.org/software/gawk/manual/gawk.html
  Description: language definition for Awk scripts
  Category: scripting
  */

  /** @type LanguageFn */
  function awk(hljs) {
    const VARIABLE = {
      className: 'variable',
      variants: [
        { begin: /\$[\w\d#@][\w\d_]*/ },
        { begin: /\$\{(.*?)\}/ }
      ]
    };
    const KEYWORDS = 'BEGIN END if else while do for in break continue delete next nextfile function func exit|10';
    const STRING = {
      className: 'string',
      contains: [ hljs.BACKSLASH_ESCAPE ],
      variants: [
        {
          begin: /(u|b)?r?'''/,
          end: /'''/,
          relevance: 10
        },
        {
          begin: /(u|b)?r?"""/,
          end: /"""/,
          relevance: 10
        },
        {
          begin: /(u|r|ur)'/,
          end: /'/,
          relevance: 10
        },
        {
          begin: /(u|r|ur)"/,
          end: /"/,
          relevance: 10
        },
        {
          begin: /(b|br)'/,
          end: /'/
        },
        {
          begin: /(b|br)"/,
          end: /"/
        },
        hljs.APOS_STRING_MODE,
        hljs.QUOTE_STRING_MODE
      ]
    };
    return {
      name: 'Awk',
      keywords: { keyword: KEYWORDS },
      contains: [
        VARIABLE,
        STRING,
        hljs.REGEXP_MODE,
        hljs.HASH_COMMENT_MODE,
        hljs.NUMBER_MODE
      ]
    };
  }

  return awk;

})();

    hljs.registerLanguage('awk', hljsGrammar);
  })();/*! `bash` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Bash
  Author: vah <vahtenberg@gmail.com>
  Contributrors: Benjamin Pannell <contact@sierrasoftworks.com>
  Website: https://www.gnu.org/software/bash/
  Category: common, scripting
  */

  /** @type LanguageFn */
  function bash(hljs) {
    const regex = hljs.regex;
    const VAR = {};
    const BRACED_VAR = {
      begin: /\$\{/,
      end: /\}/,
      contains: [
        "self",
        {
          begin: /:-/,
          contains: [ VAR ]
        } // default values
      ]
    };
    Object.assign(VAR, {
      className: 'variable',
      variants: [
        { begin: regex.concat(/\$[\w\d#@][\w\d_]*/,
          // negative look-ahead tries to avoid matching patterns that are not
          // Perl at all like $ident$, @ident@, etc.
          `(?![\\w\\d])(?![$])`) },
        BRACED_VAR
      ]
    });

    const SUBST = {
      className: 'subst',
      begin: /\$\(/,
      end: /\)/,
      contains: [ hljs.BACKSLASH_ESCAPE ]
    };
    const COMMENT = hljs.inherit(
      hljs.COMMENT(),
      {
        match: [
          /(^|\s)/,
          /#.*$/
        ],
        scope: {
          2: 'comment'
        }
      }
    );
    const HERE_DOC = {
      begin: /<<-?\s*(?=\w+)/,
      starts: { contains: [
        hljs.END_SAME_AS_BEGIN({
          begin: /(\w+)/,
          end: /(\w+)/,
          className: 'string'
        })
      ] }
    };
    const QUOTE_STRING = {
      className: 'string',
      begin: /"/,
      end: /"/,
      contains: [
        hljs.BACKSLASH_ESCAPE,
        VAR,
        SUBST
      ]
    };
    SUBST.contains.push(QUOTE_STRING);
    const ESCAPED_QUOTE = {
      match: /\\"/
    };
    const APOS_STRING = {
      className: 'string',
      begin: /'/,
      end: /'/
    };
    const ESCAPED_APOS = {
      match: /\\'/
    };
    const ARITHMETIC = {
      begin: /\$?\(\(/,
      end: /\)\)/,
      contains: [
        {
          begin: /\d+#[0-9a-f]+/,
          className: "number"
        },
        hljs.NUMBER_MODE,
        VAR
      ]
    };
    const SH_LIKE_SHELLS = [
      "fish",
      "bash",
      "zsh",
      "sh",
      "csh",
      "ksh",
      "tcsh",
      "dash",
      "scsh",
    ];
    const KNOWN_SHEBANG = hljs.SHEBANG({
      binary: `(${SH_LIKE_SHELLS.join("|")})`,
      relevance: 10
    });
    const FUNCTION = {
      className: 'function',
      begin: /\w[\w\d_]*\s*\(\s*\)\s*\{/,
      returnBegin: true,
      contains: [ hljs.inherit(hljs.TITLE_MODE, { begin: /\w[\w\d_]*/ }) ],
      relevance: 0
    };

    const KEYWORDS = [
      "if",
      "then",
      "else",
      "elif",
      "fi",
      "time",
      "for",
      "while",
      "until",
      "in",
      "do",
      "done",
      "case",
      "esac",
      "coproc",
      "function",
      "select"
    ];

    const LITERALS = [
      "true",
      "false"
    ];

    // to consume paths to prevent keyword matches inside them
    const PATH_MODE = { match: /(\/[a-z._-]+)+/ };

    // http://www.gnu.org/software/bash/manual/html_node/Shell-Builtin-Commands.html
    const SHELL_BUILT_INS = [
      "break",
      "cd",
      "continue",
      "eval",
      "exec",
      "exit",
      "export",
      "getopts",
      "hash",
      "pwd",
      "readonly",
      "return",
      "shift",
      "test",
      "times",
      "trap",
      "umask",
      "unset"
    ];

    const BASH_BUILT_INS = [
      "alias",
      "bind",
      "builtin",
      "caller",
      "command",
      "declare",
      "echo",
      "enable",
      "help",
      "let",
      "local",
      "logout",
      "mapfile",
      "printf",
      "read",
      "readarray",
      "source",
      "sudo",
      "type",
      "typeset",
      "ulimit",
      "unalias"
    ];

    const ZSH_BUILT_INS = [
      "autoload",
      "bg",
      "bindkey",
      "bye",
      "cap",
      "chdir",
      "clone",
      "comparguments",
      "compcall",
      "compctl",
      "compdescribe",
      "compfiles",
      "compgroups",
      "compquote",
      "comptags",
      "comptry",
      "compvalues",
      "dirs",
      "disable",
      "disown",
      "echotc",
      "echoti",
      "emulate",
      "fc",
      "fg",
      "float",
      "functions",
      "getcap",
      "getln",
      "history",
      "integer",
      "jobs",
      "kill",
      "limit",
      "log",
      "noglob",
      "popd",
      "print",
      "pushd",
      "pushln",
      "rehash",
      "sched",
      "setcap",
      "setopt",
      "stat",
      "suspend",
      "ttyctl",
      "unfunction",
      "unhash",
      "unlimit",
      "unsetopt",
      "vared",
      "wait",
      "whence",
      "where",
      "which",
      "zcompile",
      "zformat",
      "zftp",
      "zle",
      "zmodload",
      "zparseopts",
      "zprof",
      "zpty",
      "zregexparse",
      "zsocket",
      "zstyle",
      "ztcp"
    ];

    const GNU_CORE_UTILS = [
      "chcon",
      "chgrp",
      "chown",
      "chmod",
      "cp",
      "dd",
      "df",
      "dir",
      "dircolors",
      "ln",
      "ls",
      "mkdir",
      "mkfifo",
      "mknod",
      "mktemp",
      "mv",
      "realpath",
      "rm",
      "rmdir",
      "shred",
      "sync",
      "touch",
      "truncate",
      "vdir",
      "b2sum",
      "base32",
      "base64",
      "cat",
      "cksum",
      "comm",
      "csplit",
      "cut",
      "expand",
      "fmt",
      "fold",
      "head",
      "join",
      "md5sum",
      "nl",
      "numfmt",
      "od",
      "paste",
      "ptx",
      "pr",
      "sha1sum",
      "sha224sum",
      "sha256sum",
      "sha384sum",
      "sha512sum",
      "shuf",
      "sort",
      "split",
      "sum",
      "tac",
      "tail",
      "tr",
      "tsort",
      "unexpand",
      "uniq",
      "wc",
      "arch",
      "basename",
      "chroot",
      "date",
      "dirname",
      "du",
      "echo",
      "env",
      "expr",
      "factor",
      // "false", // keyword literal already
      "groups",
      "hostid",
      "id",
      "link",
      "logname",
      "nice",
      "nohup",
      "nproc",
      "pathchk",
      "pinky",
      "printenv",
      "printf",
      "pwd",
      "readlink",
      "runcon",
      "seq",
      "sleep",
      "stat",
      "stdbuf",
      "stty",
      "tee",
      "test",
      "timeout",
      // "true", // keyword literal already
      "tty",
      "uname",
      "unlink",
      "uptime",
      "users",
      "who",
      "whoami",
      "yes"
    ];

    return {
      name: 'Bash',
      aliases: [
        'sh',
        'zsh'
      ],
      keywords: {
        $pattern: /\b[a-z][a-z0-9._-]+\b/,
        keyword: KEYWORDS,
        literal: LITERALS,
        built_in: [
          ...SHELL_BUILT_INS,
          ...BASH_BUILT_INS,
          // Shell modifiers
          "set",
          "shopt",
          ...ZSH_BUILT_INS,
          ...GNU_CORE_UTILS
        ]
      },
      contains: [
        KNOWN_SHEBANG, // to catch known shells and boost relevancy
        hljs.SHEBANG(), // to catch unknown shells but still highlight the shebang
        FUNCTION,
        ARITHMETIC,
        COMMENT,
        HERE_DOC,
        PATH_MODE,
        QUOTE_STRING,
        ESCAPED_QUOTE,
        APOS_STRING,
        ESCAPED_APOS,
        VAR
      ]
    };
  }

  return bash;

})();

    hljs.registerLanguage('bash', hljsGrammar);
  })();/*! `brainfuck` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Brainfuck
  Author: Evgeny Stepanischev <imbolk@gmail.com>
  Website: https://esolangs.org/wiki/Brainfuck
  */

  /** @type LanguageFn */
  function brainfuck(hljs) {
    const LITERAL = {
      className: 'literal',
      begin: /[+-]+/,
      relevance: 0
    };
    return {
      name: 'Brainfuck',
      aliases: [ 'bf' ],
      contains: [
        hljs.COMMENT(
          /[^\[\]\.,\+\-<> \r\n]/,
          /[\[\]\.,\+\-<> \r\n]/,
          {
            contains: [
              {
                match: /[ ]+[^\[\]\.,\+\-<> \r\n]/,
                relevance: 0
              }
            ],
            returnEnd: true,
            relevance: 0
          }
        ),
        {
          className: 'title',
          begin: '[\\[\\]]',
          relevance: 0
        },
        {
          className: 'string',
          begin: '[\\.,]',
          relevance: 0
        },
        {
          // this mode works as the only relevance counter
          // it looks ahead to find the start of a run of literals
          // so only the runs are counted as relevant
          begin: /(?=\+\+|--)/,
          contains: [ LITERAL ]
        },
        LITERAL
      ]
    };
  }

  return brainfuck;

})();

    hljs.registerLanguage('brainfuck', hljsGrammar);
  })();/*! `c` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: C
  Category: common, system
  Website: https://en.wikipedia.org/wiki/C_(programming_language)
  */

  /** @type LanguageFn */
  function c(hljs) {
    const regex = hljs.regex;
    // added for historic reasons because `hljs.C_LINE_COMMENT_MODE` does
    // not include such support nor can we be sure all the grammars depending
    // on it would desire this behavior
    const C_LINE_COMMENT_MODE = hljs.COMMENT('//', '$', { contains: [ { begin: /\\\n/ } ] });
    const DECLTYPE_AUTO_RE = 'decltype\\(auto\\)';
    const NAMESPACE_RE = '[a-zA-Z_]\\w*::';
    const TEMPLATE_ARGUMENT_RE = '<[^<>]+>';
    const FUNCTION_TYPE_RE = '('
      + DECLTYPE_AUTO_RE + '|'
      + regex.optional(NAMESPACE_RE)
      + '[a-zA-Z_]\\w*' + regex.optional(TEMPLATE_ARGUMENT_RE)
    + ')';


    const TYPES = {
      className: 'type',
      variants: [
        { begin: '\\b[a-z\\d_]*_t\\b' },
        { match: /\batomic_[a-z]{3,6}\b/ }
      ]

    };

    // https://en.cppreference.com/w/cpp/language/escape
    // \\ \x \xFF \u2837 \u00323747 \374
    const CHARACTER_ESCAPES = '\\\\(x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{4,8}|[0-7]{3}|\\S)';
    const STRINGS = {
      className: 'string',
      variants: [
        {
          begin: '(u8?|U|L)?"',
          end: '"',
          illegal: '\\n',
          contains: [ hljs.BACKSLASH_ESCAPE ]
        },
        {
          begin: '(u8?|U|L)?\'(' + CHARACTER_ESCAPES + "|.)",
          end: '\'',
          illegal: '.'
        },
        hljs.END_SAME_AS_BEGIN({
          begin: /(?:u8?|U|L)?R"([^()\\ ]{0,16})\(/,
          end: /\)([^()\\ ]{0,16})"/
        })
      ]
    };

    const NUMBERS = {
      className: 'number',
      variants: [
        { match: /\b(0b[01']+)/ },  
        { match: /(-?)\b([\d']+(\.[\d']*)?|\.[\d']+)((ll|LL|l|L)(u|U)?|(u|U)(ll|LL|l|L)?|f|F|b|B)/ },  
        { match: /(-?)\b(0[xX][a-fA-F0-9]+(?:'[a-fA-F0-9]+)*(?:\.[a-fA-F0-9]*(?:'[a-fA-F0-9]*)*)?(?:[pP][-+]?[0-9]+)?(l|L)?(u|U)?)/ },  
        { match: /(-?)\b\d+(?:'\d+)*(?:\.\d*(?:'\d*)*)?(?:[eE][-+]?\d+)?/ }  
    ],
      relevance: 0
    };  
    
    const PREPROCESSOR = {
      className: 'meta',
      begin: /#\s*[a-z]+\b/,
      end: /$/,
      keywords: { keyword:
          'if else elif endif define undef warning error line '
          + 'pragma _Pragma ifdef ifndef elifdef elifndef include' },
      contains: [
        {
          begin: /\\\n/,
          relevance: 0
        },
        hljs.inherit(STRINGS, { className: 'string' }),
        {
          className: 'string',
          begin: /<.*?>/
        },
        C_LINE_COMMENT_MODE,
        hljs.C_BLOCK_COMMENT_MODE
      ]
    };

    const TITLE_MODE = {
      className: 'title',
      begin: regex.optional(NAMESPACE_RE) + hljs.IDENT_RE,
      relevance: 0
    };

    const FUNCTION_TITLE = regex.optional(NAMESPACE_RE) + hljs.IDENT_RE + '\\s*\\(';

    const C_KEYWORDS = [
      "asm",
      "auto",
      "break",
      "case",
      "continue",
      "default",
      "do",
      "else",
      "enum",
      "extern",
      "for",
      "fortran",
      "goto",
      "if",
      "inline",
      "register",
      "restrict",
      "return",
      "sizeof",
      "typeof",
      "typeof_unqual",
      "struct",
      "switch",
      "typedef",
      "union",
      "volatile",
      "while",
      "_Alignas",
      "_Alignof",
      "_Atomic",
      "_Generic",
      "_Noreturn",
      "_Static_assert",
      "_Thread_local",
      // aliases
      "alignas",
      "alignof",
      "noreturn",
      "static_assert",
      "thread_local",
      // not a C keyword but is, for all intents and purposes, treated exactly like one.
      "_Pragma"
    ];

    const C_TYPES = [
      "float",
      "double",
      "signed",
      "unsigned",
      "int",
      "short",
      "long",
      "char",
      "void",
      "_Bool",
      "_BitInt",
      "_Complex",
      "_Imaginary",
      "_Decimal32",
      "_Decimal64",
      "_Decimal96",
      "_Decimal128",
      "_Decimal64x",
      "_Decimal128x",
      "_Float16",
      "_Float32",
      "_Float64",
      "_Float128",
      "_Float32x",
      "_Float64x",
      "_Float128x",
      // modifiers
      "const",
      "static",
      "constexpr",
      // aliases
      "complex",
      "bool",
      "imaginary"
    ];

    const KEYWORDS = {
      keyword: C_KEYWORDS,
      type: C_TYPES,
      literal: 'true false NULL',
      // TODO: apply hinting work similar to what was done in cpp.js
      built_in: 'std string wstring cin cout cerr clog stdin stdout stderr stringstream istringstream ostringstream '
        + 'auto_ptr deque list queue stack vector map set pair bitset multiset multimap unordered_set '
        + 'unordered_map unordered_multiset unordered_multimap priority_queue make_pair array shared_ptr abort terminate abs acos '
        + 'asin atan2 atan calloc ceil cosh cos exit exp fabs floor fmod fprintf fputs free frexp '
        + 'fscanf future isalnum isalpha iscntrl isdigit isgraph islower isprint ispunct isspace isupper '
        + 'isxdigit tolower toupper labs ldexp log10 log malloc realloc memchr memcmp memcpy memset modf pow '
        + 'printf putchar puts scanf sinh sin snprintf sprintf sqrt sscanf strcat strchr strcmp '
        + 'strcpy strcspn strlen strncat strncmp strncpy strpbrk strrchr strspn strstr tanh tan '
        + 'vfprintf vprintf vsprintf endl initializer_list unique_ptr',
    };

    const EXPRESSION_CONTAINS = [
      PREPROCESSOR,
      TYPES,
      C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      NUMBERS,
      STRINGS
    ];

    const EXPRESSION_CONTEXT = {
      // This mode covers expression context where we can't expect a function
      // definition and shouldn't highlight anything that looks like one:
      // `return some()`, `else if()`, `(x*sum(1, 2))`
      variants: [
        {
          begin: /=/,
          end: /;/
        },
        {
          begin: /\(/,
          end: /\)/
        },
        {
          beginKeywords: 'new throw return else',
          end: /;/
        }
      ],
      keywords: KEYWORDS,
      contains: EXPRESSION_CONTAINS.concat([
        {
          begin: /\(/,
          end: /\)/,
          keywords: KEYWORDS,
          contains: EXPRESSION_CONTAINS.concat([ 'self' ]),
          relevance: 0
        }
      ]),
      relevance: 0
    };

    const FUNCTION_DECLARATION = {
      begin: '(' + FUNCTION_TYPE_RE + '[\\*&\\s]+)+' + FUNCTION_TITLE,
      returnBegin: true,
      end: /[{;=]/,
      excludeEnd: true,
      keywords: KEYWORDS,
      illegal: /[^\w\s\*&:<>.]/,
      contains: [
        { // to prevent it from being confused as the function title
          begin: DECLTYPE_AUTO_RE,
          keywords: KEYWORDS,
          relevance: 0
        },
        {
          begin: FUNCTION_TITLE,
          returnBegin: true,
          contains: [ hljs.inherit(TITLE_MODE, { className: "title.function" }) ],
          relevance: 0
        },
        // allow for multiple declarations, e.g.:
        // extern void f(int), g(char);
        {
          relevance: 0,
          match: /,/
        },
        {
          className: 'params',
          begin: /\(/,
          end: /\)/,
          keywords: KEYWORDS,
          relevance: 0,
          contains: [
            C_LINE_COMMENT_MODE,
            hljs.C_BLOCK_COMMENT_MODE,
            STRINGS,
            NUMBERS,
            TYPES,
            // Count matching parentheses.
            {
              begin: /\(/,
              end: /\)/,
              keywords: KEYWORDS,
              relevance: 0,
              contains: [
                'self',
                C_LINE_COMMENT_MODE,
                hljs.C_BLOCK_COMMENT_MODE,
                STRINGS,
                NUMBERS,
                TYPES
              ]
            }
          ]
        },
        TYPES,
        C_LINE_COMMENT_MODE,
        hljs.C_BLOCK_COMMENT_MODE,
        PREPROCESSOR
      ]
    };

    return {
      name: "C",
      aliases: [ 'h' ],
      keywords: KEYWORDS,
      // Until differentiations are added between `c` and `cpp`, `c` will
      // not be auto-detected to avoid auto-detect conflicts between C and C++
      disableAutodetect: true,
      illegal: '</',
      contains: [].concat(
        EXPRESSION_CONTEXT,
        FUNCTION_DECLARATION,
        EXPRESSION_CONTAINS,
        [
          PREPROCESSOR,
          {
            begin: hljs.IDENT_RE + '::',
            keywords: KEYWORDS
          },
          {
            className: 'class',
            beginKeywords: 'enum class struct union',
            end: /[{;:<>=]/,
            contains: [
              { beginKeywords: "final class struct" },
              hljs.TITLE_MODE
            ]
          }
        ]),
      exports: {
        preprocessor: PREPROCESSOR,
        strings: STRINGS,
        keywords: KEYWORDS
      }
    };
  }

  return c;

})();

    hljs.registerLanguage('c', hljsGrammar);
  })();/*! `clojure` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Clojure
  Description: Clojure syntax (based on lisp.js)
  Author: mfornos
  Website: https://clojure.org
  Category: lisp
  */

  /** @type LanguageFn */
  function clojure(hljs) {
    const SYMBOLSTART = 'a-zA-Z_\\-!.?+*=<>&\'';
    const SYMBOL_RE = '[#]?[' + SYMBOLSTART + '][' + SYMBOLSTART + '0-9/;:$#]*';
    const globals = 'def defonce defprotocol defstruct defmulti defmethod defn- defn defmacro deftype defrecord';
    const keywords = {
      $pattern: SYMBOL_RE,
      built_in:
        // Clojure keywords
        globals + ' '
        + 'cond apply if-not if-let if not not= =|0 <|0 >|0 <=|0 >=|0 ==|0 +|0 /|0 *|0 -|0 rem '
        + 'quot neg? pos? delay? symbol? keyword? true? false? integer? empty? coll? list? '
        + 'set? ifn? fn? associative? sequential? sorted? counted? reversible? number? decimal? '
        + 'class? distinct? isa? float? rational? reduced? ratio? odd? even? char? seq? vector? '
        + 'string? map? nil? contains? zero? instance? not-every? not-any? libspec? -> ->> .. . '
        + 'inc compare do dotimes mapcat take remove take-while drop letfn drop-last take-last '
        + 'drop-while while intern condp case reduced cycle split-at split-with repeat replicate '
        + 'iterate range merge zipmap declare line-seq sort comparator sort-by dorun doall nthnext '
        + 'nthrest partition eval doseq await await-for let agent atom send send-off release-pending-sends '
        + 'add-watch mapv filterv remove-watch agent-error restart-agent set-error-handler error-handler '
        + 'set-error-mode! error-mode shutdown-agents quote var fn loop recur throw try monitor-enter '
        + 'monitor-exit macroexpand macroexpand-1 for dosync and or '
        + 'when when-not when-let comp juxt partial sequence memoize constantly complement identity assert '
        + 'peek pop doto proxy first rest cons cast coll last butlast '
        + 'sigs reify second ffirst fnext nfirst nnext meta with-meta ns in-ns create-ns import '
        + 'refer keys select-keys vals key val rseq name namespace promise into transient persistent! conj! '
        + 'assoc! dissoc! pop! disj! use class type num float double short byte boolean bigint biginteger '
        + 'bigdec print-method print-dup throw-if printf format load compile get-in update-in pr pr-on newline '
        + 'flush read slurp read-line subvec with-open memfn time re-find re-groups rand-int rand mod locking '
        + 'assert-valid-fdecl alias resolve ref deref refset swap! reset! set-validator! compare-and-set! alter-meta! '
        + 'reset-meta! commute get-validator alter ref-set ref-history-count ref-min-history ref-max-history ensure sync io! '
        + 'new next conj set! to-array future future-call into-array aset gen-class reduce map filter find empty '
        + 'hash-map hash-set sorted-map sorted-map-by sorted-set sorted-set-by vec vector seq flatten reverse assoc dissoc list '
        + 'disj get union difference intersection extend extend-type extend-protocol int nth delay count concat chunk chunk-buffer '
        + 'chunk-append chunk-first chunk-rest max min dec unchecked-inc-int unchecked-inc unchecked-dec-inc unchecked-dec unchecked-negate '
        + 'unchecked-add-int unchecked-add unchecked-subtract-int unchecked-subtract chunk-next chunk-cons chunked-seq? prn vary-meta '
        + 'lazy-seq spread list* str find-keyword keyword symbol gensym force rationalize'
    };

    const SYMBOL = {
      begin: SYMBOL_RE,
      relevance: 0
    };
    const NUMBER = {
      scope: 'number',
      relevance: 0,
      variants: [
        { match: /[-+]?0[xX][0-9a-fA-F]+N?/ }, // hexadecimal                 // 0x2a
        { match: /[-+]?0[0-7]+N?/ }, // octal                       // 052
        { match: /[-+]?[1-9][0-9]?[rR][0-9a-zA-Z]+N?/ }, // variable radix from 2 to 36 // 2r101010, 8r52, 36r16
        { match: /[-+]?[0-9]+\/[0-9]+N?/ }, // ratio                       // 1/2
        { match: /[-+]?[0-9]+((\.[0-9]*([eE][+-]?[0-9]+)?M?)|([eE][+-]?[0-9]+M?|M))/ }, // float        // 0.42 4.2E-1M 42E1 42M
        { match: /[-+]?([1-9][0-9]*|0)N?/ }, // int (don't match leading 0) // 42 42N
      ]
    };
    const CHARACTER = {
      scope: 'character',
      variants: [
        { match: /\\o[0-3]?[0-7]{1,2}/ }, // Unicode Octal 0 - 377
        { match: /\\u[0-9a-fA-F]{4}/ }, // Unicode Hex 0000 - FFFF
        { match: /\\(newline|space|tab|formfeed|backspace|return)/ }, // special characters
        {
          match: /\\\S/,
          relevance: 0
        } // any non-whitespace char
      ]
    };
    const REGEX = {
      scope: 'regex',
      begin: /#"/,
      end: /"/,
      contains: [ hljs.BACKSLASH_ESCAPE ]
    };
    const STRING = hljs.inherit(hljs.QUOTE_STRING_MODE, { illegal: null });
    const COMMA = {
      scope: 'punctuation',
      match: /,/,
      relevance: 0
    };
    const COMMENT = hljs.COMMENT(
      ';',
      '$',
      { relevance: 0 }
    );
    const LITERAL = {
      className: 'literal',
      begin: /\b(true|false|nil)\b/
    };
    const COLLECTION = {
      begin: "\\[|(#::?" + SYMBOL_RE + ")?\\{",
      end: '[\\]\\}]',
      relevance: 0
    };
    const KEY = {
      className: 'symbol',
      begin: '[:]{1,2}' + SYMBOL_RE
    };
    const LIST = {
      begin: '\\(',
      end: '\\)'
    };
    const BODY = {
      endsWithParent: true,
      relevance: 0
    };
    const NAME = {
      keywords: keywords,
      className: 'name',
      begin: SYMBOL_RE,
      relevance: 0,
      starts: BODY
    };
    const DEFAULT_CONTAINS = [
      COMMA,
      LIST,
      CHARACTER,
      REGEX,
      STRING,
      COMMENT,
      KEY,
      COLLECTION,
      NUMBER,
      LITERAL,
      SYMBOL
    ];

    const GLOBAL = {
      beginKeywords: globals,
      keywords: {
        $pattern: SYMBOL_RE,
        keyword: globals
      },
      end: '(\\[|#|\\d|"|:|\\{|\\)|\\(|$)',
      contains: [
        {
          className: 'title',
          begin: SYMBOL_RE,
          relevance: 0,
          excludeEnd: true,
          // we can only have a single title
          endsParent: true
        }
      ].concat(DEFAULT_CONTAINS)
    };

    LIST.contains = [
      GLOBAL,
      NAME,
      BODY
    ];
    BODY.contains = DEFAULT_CONTAINS;
    COLLECTION.contains = DEFAULT_CONTAINS;

    return {
      name: 'Clojure',
      aliases: [
        'clj',
        'edn'
      ],
      illegal: /\S/,
      contains: [
        COMMA,
        LIST,
        CHARACTER,
        REGEX,
        STRING,
        COMMENT,
        KEY,
        COLLECTION,
        NUMBER,
        LITERAL
      ]
    };
  }

  return clojure;

})();

    hljs.registerLanguage('clojure', hljsGrammar);
  })();/*! `clojure-repl` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Clojure REPL
  Description: Clojure REPL sessions
  Author: Ivan Sagalaev <maniac@softwaremaniacs.org>
  Requires: clojure.js
  Website: https://clojure.org
  Category: lisp
  */

  /** @type LanguageFn */
  function clojureRepl(hljs) {
    return {
      name: 'Clojure REPL',
      contains: [
        {
          className: 'meta.prompt',
          begin: /^([\w.-]+|\s*#_)?=>/,
          starts: {
            end: /$/,
            subLanguage: 'clojure'
          }
        }
      ]
    };
  }

  return clojureRepl;

})();

    hljs.registerLanguage('clojure-repl', hljsGrammar);
  })();/*! `cmake` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: CMake
  Description: CMake is an open-source cross-platform system for build automation.
  Author: Igor Kalnitsky <igor@kalnitsky.org>
  Website: https://cmake.org
  Category: build-system
  */

  /** @type LanguageFn */
  function cmake(hljs) {
    return {
      name: 'CMake',
      aliases: [ 'cmake.in' ],
      case_insensitive: true,
      keywords: { keyword:
          // scripting commands
          'break cmake_host_system_information cmake_minimum_required cmake_parse_arguments '
          + 'cmake_policy configure_file continue elseif else endforeach endfunction endif endmacro '
          + 'endwhile execute_process file find_file find_library find_package find_path '
          + 'find_program foreach function get_cmake_property get_directory_property '
          + 'get_filename_component get_property if include include_guard list macro '
          + 'mark_as_advanced math message option return separate_arguments '
          + 'set_directory_properties set_property set site_name string unset variable_watch while '
          // project commands
          + 'add_compile_definitions add_compile_options add_custom_command add_custom_target '
          + 'add_definitions add_dependencies add_executable add_library add_link_options '
          + 'add_subdirectory add_test aux_source_directory build_command create_test_sourcelist '
          + 'define_property enable_language enable_testing export fltk_wrap_ui '
          + 'get_source_file_property get_target_property get_test_property include_directories '
          + 'include_external_msproject include_regular_expression install link_directories '
          + 'link_libraries load_cache project qt_wrap_cpp qt_wrap_ui remove_definitions '
          + 'set_source_files_properties set_target_properties set_tests_properties source_group '
          + 'target_compile_definitions target_compile_features target_compile_options '
          + 'target_include_directories target_link_directories target_link_libraries '
          + 'target_link_options target_sources try_compile try_run '
          // CTest commands
          + 'ctest_build ctest_configure ctest_coverage ctest_empty_binary_directory ctest_memcheck '
          + 'ctest_read_custom_files ctest_run_script ctest_sleep ctest_start ctest_submit '
          + 'ctest_test ctest_update ctest_upload '
          // deprecated commands
          + 'build_name exec_program export_library_dependencies install_files install_programs '
          + 'install_targets load_command make_directory output_required_files remove '
          + 'subdir_depends subdirs use_mangled_mesa utility_source variable_requires write_file '
          + 'qt5_use_modules qt5_use_package qt5_wrap_cpp '
          // core keywords
          + 'on off true false and or not command policy target test exists is_newer_than '
          + 'is_directory is_symlink is_absolute matches less greater equal less_equal '
          + 'greater_equal strless strgreater strequal strless_equal strgreater_equal version_less '
          + 'version_greater version_equal version_less_equal version_greater_equal in_list defined' },
      contains: [
        {
          className: 'variable',
          begin: /\$\{/,
          end: /\}/
        },
        hljs.COMMENT(/#\[\[/, /]]/),
        hljs.HASH_COMMENT_MODE,
        hljs.QUOTE_STRING_MODE,
        hljs.NUMBER_MODE
      ]
    };
  }

  return cmake;

})();

    hljs.registerLanguage('cmake', hljsGrammar);
  })();/*! `coffeescript` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  const KEYWORDS = [
    "as", // for exports
    "in",
    "of",
    "if",
    "for",
    "while",
    "finally",
    "var",
    "new",
    "function",
    "do",
    "return",
    "void",
    "else",
    "break",
    "catch",
    "instanceof",
    "with",
    "throw",
    "case",
    "default",
    "try",
    "switch",
    "continue",
    "typeof",
    "delete",
    "let",
    "yield",
    "const",
    "class",
    // JS handles these with a special rule
    // "get",
    // "set",
    "debugger",
    "async",
    "await",
    "static",
    "import",
    "from",
    "export",
    "extends",
    // It's reached stage 3, which is "recommended for implementation":
    "using"
  ];
  const LITERALS = [
    "true",
    "false",
    "null",
    "undefined",
    "NaN",
    "Infinity"
  ];

  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects
  const TYPES = [
    // Fundamental objects
    "Object",
    "Function",
    "Boolean",
    "Symbol",
    // numbers and dates
    "Math",
    "Date",
    "Number",
    "BigInt",
    // text
    "String",
    "RegExp",
    // Indexed collections
    "Array",
    "Float32Array",
    "Float64Array",
    "Int8Array",
    "Uint8Array",
    "Uint8ClampedArray",
    "Int16Array",
    "Int32Array",
    "Uint16Array",
    "Uint32Array",
    "BigInt64Array",
    "BigUint64Array",
    // Keyed collections
    "Set",
    "Map",
    "WeakSet",
    "WeakMap",
    // Structured data
    "ArrayBuffer",
    "SharedArrayBuffer",
    "Atomics",
    "DataView",
    "JSON",
    // Control abstraction objects
    "Promise",
    "Generator",
    "GeneratorFunction",
    "AsyncFunction",
    // Reflection
    "Reflect",
    "Proxy",
    // Internationalization
    "Intl",
    // WebAssembly
    "WebAssembly"
  ];

  const ERROR_TYPES = [
    "Error",
    "EvalError",
    "InternalError",
    "RangeError",
    "ReferenceError",
    "SyntaxError",
    "TypeError",
    "URIError"
  ];

  const BUILT_IN_GLOBALS = [
    "setInterval",
    "setTimeout",
    "clearInterval",
    "clearTimeout",

    "require",
    "exports",

    "eval",
    "isFinite",
    "isNaN",
    "parseFloat",
    "parseInt",
    "decodeURI",
    "decodeURIComponent",
    "encodeURI",
    "encodeURIComponent",
    "escape",
    "unescape"
  ];

  const BUILT_INS = [].concat(
    BUILT_IN_GLOBALS,
    TYPES,
    ERROR_TYPES
  );

  /*
  Language: CoffeeScript
  Author: Dmytrii Nagirniak <dnagir@gmail.com>
  Contributors: Oleg Efimov <efimovov@gmail.com>, Cédric Néhémie <cedric.nehemie@gmail.com>
  Description: CoffeeScript is a programming language that transcompiles to JavaScript. For info about language see http://coffeescript.org/
  Category: scripting
  Website: https://coffeescript.org
  */


  /** @type LanguageFn */
  function coffeescript(hljs) {
    const COFFEE_BUILT_INS = [
      'npm',
      'print'
    ];
    const COFFEE_LITERALS = [
      'yes',
      'no',
      'on',
      'off'
    ];
    const COFFEE_KEYWORDS = [
      'then',
      'unless',
      'until',
      'loop',
      'by',
      'when',
      'and',
      'or',
      'is',
      'isnt',
      'not'
    ];
    const NOT_VALID_KEYWORDS = [
      "var",
      "const",
      "let",
      "function",
      "static"
    ];
    const excluding = (list) =>
      (kw) => !list.includes(kw);
    const KEYWORDS$1 = {
      keyword: KEYWORDS.concat(COFFEE_KEYWORDS).filter(excluding(NOT_VALID_KEYWORDS)),
      literal: LITERALS.concat(COFFEE_LITERALS),
      built_in: BUILT_INS.concat(COFFEE_BUILT_INS)
    };
    const JS_IDENT_RE = '[A-Za-z$_][0-9A-Za-z$_]*';
    const SUBST = {
      className: 'subst',
      begin: /#\{/,
      end: /\}/,
      keywords: KEYWORDS$1
    };
    const EXPRESSIONS = [
      hljs.BINARY_NUMBER_MODE,
      hljs.inherit(hljs.C_NUMBER_MODE, { starts: {
        end: '(\\s*/)?',
        relevance: 0
      } }), // a number tries to eat the following slash to prevent treating it as a regexp
      {
        className: 'string',
        variants: [
          {
            begin: /'''/,
            end: /'''/,
            contains: [ hljs.BACKSLASH_ESCAPE ]
          },
          {
            begin: /'/,
            end: /'/,
            contains: [ hljs.BACKSLASH_ESCAPE ]
          },
          {
            begin: /"""/,
            end: /"""/,
            contains: [
              hljs.BACKSLASH_ESCAPE,
              SUBST
            ]
          },
          {
            begin: /"/,
            end: /"/,
            contains: [
              hljs.BACKSLASH_ESCAPE,
              SUBST
            ]
          }
        ]
      },
      {
        className: 'regexp',
        variants: [
          {
            begin: '///',
            end: '///',
            contains: [
              SUBST,
              hljs.HASH_COMMENT_MODE
            ]
          },
          {
            begin: '//[gim]{0,3}(?=\\W)',
            relevance: 0
          },
          {
            // regex can't start with space to parse x / 2 / 3 as two divisions
            // regex can't start with *, and it supports an "illegal" in the main mode
            begin: /\/(?![ *]).*?(?![\\]).\/[gim]{0,3}(?=\W)/ }
        ]
      },
      { begin: '@' + JS_IDENT_RE // relevance booster
      },
      {
        subLanguage: 'javascript',
        excludeBegin: true,
        excludeEnd: true,
        variants: [
          {
            begin: '```',
            end: '```'
          },
          {
            begin: '`',
            end: '`'
          }
        ]
      }
    ];
    SUBST.contains = EXPRESSIONS;

    const TITLE = hljs.inherit(hljs.TITLE_MODE, { begin: JS_IDENT_RE });
    const POSSIBLE_PARAMS_RE = '(\\(.*\\)\\s*)?\\B[-=]>';
    const PARAMS = {
      className: 'params',
      begin: '\\([^\\(]',
      returnBegin: true,
      /* We need another contained nameless mode to not have every nested
      pair of parens to be called "params" */
      contains: [
        {
          begin: /\(/,
          end: /\)/,
          keywords: KEYWORDS$1,
          contains: [ 'self' ].concat(EXPRESSIONS)
        }
      ]
    };

    const CLASS_DEFINITION = {
      variants: [
        { match: [
          /class\s+/,
          JS_IDENT_RE,
          /\s+extends\s+/,
          JS_IDENT_RE
        ] },
        { match: [
          /class\s+/,
          JS_IDENT_RE
        ] }
      ],
      scope: {
        2: "title.class",
        4: "title.class.inherited"
      },
      keywords: KEYWORDS$1
    };

    return {
      name: 'CoffeeScript',
      aliases: [
        'coffee',
        'cson',
        'iced'
      ],
      keywords: KEYWORDS$1,
      illegal: /\/\*/,
      contains: [
        ...EXPRESSIONS,
        hljs.COMMENT('###', '###'),
        hljs.HASH_COMMENT_MODE,
        {
          className: 'function',
          begin: '^\\s*' + JS_IDENT_RE + '\\s*=\\s*' + POSSIBLE_PARAMS_RE,
          end: '[-=]>',
          returnBegin: true,
          contains: [
            TITLE,
            PARAMS
          ]
        },
        {
          // anonymous function start
          begin: /[:\(,=]\s*/,
          relevance: 0,
          contains: [
            {
              className: 'function',
              begin: POSSIBLE_PARAMS_RE,
              end: '[-=]>',
              returnBegin: true,
              contains: [ PARAMS ]
            }
          ]
        },
        CLASS_DEFINITION,
        {
          begin: JS_IDENT_RE + ':',
          end: ':',
          returnBegin: true,
          returnEnd: true,
          relevance: 0
        }
      ]
    };
  }

  return coffeescript;

})();

    hljs.registerLanguage('coffeescript', hljsGrammar);
  })();/*! `cpp` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: C++
  Category: common, system
  Website: https://isocpp.org
  */

  /** @type LanguageFn */
  function cpp(hljs) {
    const regex = hljs.regex;
    // added for historic reasons because `hljs.C_LINE_COMMENT_MODE` does
    // not include such support nor can we be sure all the grammars depending
    // on it would desire this behavior
    const C_LINE_COMMENT_MODE = hljs.COMMENT('//', '$', { contains: [ { begin: /\\\n/ } ] });
    const DECLTYPE_AUTO_RE = 'decltype\\(auto\\)';
    const NAMESPACE_RE = '[a-zA-Z_]\\w*::';
    const TEMPLATE_ARGUMENT_RE = '<[^<>]+>';
    const FUNCTION_TYPE_RE = '(?!struct)('
      + DECLTYPE_AUTO_RE + '|'
      + regex.optional(NAMESPACE_RE)
      + '[a-zA-Z_]\\w*' + regex.optional(TEMPLATE_ARGUMENT_RE)
    + ')';

    const CPP_PRIMITIVE_TYPES = {
      className: 'type',
      begin: '\\b[a-z\\d_]*_t\\b'
    };

    // https://en.cppreference.com/w/cpp/language/escape
    // \\ \x \xFF \u2837 \u00323747 \374
    const CHARACTER_ESCAPES = '\\\\(x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{4,8}|[0-7]{3}|\\S)';
    const STRINGS = {
      className: 'string',
      variants: [
        {
          begin: '(u8?|U|L)?"',
          end: '"',
          illegal: '\\n',
          contains: [ hljs.BACKSLASH_ESCAPE ]
        },
        {
          begin: '(u8?|U|L)?\'(' + CHARACTER_ESCAPES + '|.)',
          end: '\'',
          illegal: '.'
        },
        hljs.END_SAME_AS_BEGIN({
          begin: /(?:u8?|U|L)?R"([^()\\ ]{0,16})\(/,
          end: /\)([^()\\ ]{0,16})"/
        })
      ]
    };

    const NUMBERS = {
      className: 'number',
      variants: [
        // Floating-point literal.
        { begin:
          "[+-]?(?:" // Leading sign.
            // Decimal.
            + "(?:"
              +"[0-9](?:'?[0-9])*\\.(?:[0-9](?:'?[0-9])*)?"
              + "|\\.[0-9](?:'?[0-9])*"
            + ")(?:[Ee][+-]?[0-9](?:'?[0-9])*)?"
            + "|[0-9](?:'?[0-9])*[Ee][+-]?[0-9](?:'?[0-9])*"
            // Hexadecimal.
            + "|0[Xx](?:"
              +"[0-9A-Fa-f](?:'?[0-9A-Fa-f])*(?:\\.(?:[0-9A-Fa-f](?:'?[0-9A-Fa-f])*)?)?"
              + "|\\.[0-9A-Fa-f](?:'?[0-9A-Fa-f])*"
            + ")[Pp][+-]?[0-9](?:'?[0-9])*"
          + ")(?:" // Literal suffixes.
            + "[Ff](?:16|32|64|128)?"
            + "|(BF|bf)16"
            + "|[Ll]"
            + "|" // Literal suffix is optional.
          + ")"
        },
        // Integer literal.
        { begin:
          "[+-]?\\b(?:" // Leading sign.
            + "0[Bb][01](?:'?[01])*" // Binary.
            + "|0[Xx][0-9A-Fa-f](?:'?[0-9A-Fa-f])*" // Hexadecimal.
            + "|0(?:'?[0-7])*" // Octal or just a lone zero.
            + "|[1-9](?:'?[0-9])*" // Decimal.
          + ")(?:" // Literal suffixes.
            + "[Uu](?:LL?|ll?)"
            + "|[Uu][Zz]?"
            + "|(?:LL?|ll?)[Uu]?"
            + "|[Zz][Uu]"
            + "|" // Literal suffix is optional.
          + ")"
          // Note: there are user-defined literal suffixes too, but perhaps having the custom suffix not part of the
          // literal highlight actually makes it stand out more.
        }
      ],
      relevance: 0
    };

    const PREPROCESSOR = {
      className: 'meta',
      begin: /#\s*[a-z]+\b/,
      end: /$/,
      keywords: { keyword:
          'if else elif endif define undef warning error line '
          + 'pragma _Pragma ifdef ifndef include' },
      contains: [
        {
          begin: /\\\n/,
          relevance: 0
        },
        hljs.inherit(STRINGS, { className: 'string' }),
        {
          className: 'string',
          begin: /<.*?>/
        },
        C_LINE_COMMENT_MODE,
        hljs.C_BLOCK_COMMENT_MODE
      ]
    };

    const TITLE_MODE = {
      className: 'title',
      begin: regex.optional(NAMESPACE_RE) + hljs.IDENT_RE,
      relevance: 0
    };

    const FUNCTION_TITLE = regex.optional(NAMESPACE_RE) + hljs.IDENT_RE + '\\s*\\(';

    // https://en.cppreference.com/w/cpp/keyword
    const RESERVED_KEYWORDS = [
      'alignas',
      'alignof',
      'and',
      'and_eq',
      'asm',
      'atomic_cancel',
      'atomic_commit',
      'atomic_noexcept',
      'auto',
      'bitand',
      'bitor',
      'break',
      'case',
      'catch',
      'class',
      'co_await',
      'co_return',
      'co_yield',
      'compl',
      'concept',
      'const_cast|10',
      'consteval',
      'constexpr',
      'constinit',
      'continue',
      'decltype',
      'default',
      'delete',
      'do',
      'dynamic_cast|10',
      'else',
      'enum',
      'explicit',
      'export',
      'extern',
      'false',
      'final',
      'for',
      'friend',
      'goto',
      'if',
      'import',
      'inline',
      'module',
      'mutable',
      'namespace',
      'new',
      'noexcept',
      'not',
      'not_eq',
      'nullptr',
      'operator',
      'or',
      'or_eq',
      'override',
      'private',
      'protected',
      'public',
      'reflexpr',
      'register',
      'reinterpret_cast|10',
      'requires',
      'return',
      'sizeof',
      'static_assert',
      'static_cast|10',
      'struct',
      'switch',
      'synchronized',
      'template',
      'this',
      'thread_local',
      'throw',
      'transaction_safe',
      'transaction_safe_dynamic',
      'true',
      'try',
      'typedef',
      'typeid',
      'typename',
      'union',
      'using',
      'virtual',
      'volatile',
      'while',
      'xor',
      'xor_eq'
    ];

    // https://en.cppreference.com/w/cpp/keyword
    const RESERVED_TYPES = [
      'bool',
      'char',
      'char16_t',
      'char32_t',
      'char8_t',
      'double',
      'float',
      'int',
      'long',
      'short',
      'void',
      'wchar_t',
      'unsigned',
      'signed',
      'const',
      'static'
    ];

    const TYPE_HINTS = [
      'any',
      'auto_ptr',
      'barrier',
      'binary_semaphore',
      'bitset',
      'complex',
      'condition_variable',
      'condition_variable_any',
      'counting_semaphore',
      'deque',
      'false_type',
      'flat_map',
      'flat_set',
      'future',
      'imaginary',
      'initializer_list',
      'istringstream',
      'jthread',
      'latch',
      'lock_guard',
      'multimap',
      'multiset',
      'mutex',
      'optional',
      'ostringstream',
      'packaged_task',
      'pair',
      'promise',
      'priority_queue',
      'queue',
      'recursive_mutex',
      'recursive_timed_mutex',
      'scoped_lock',
      'set',
      'shared_future',
      'shared_lock',
      'shared_mutex',
      'shared_timed_mutex',
      'shared_ptr',
      'stack',
      'string_view',
      'stringstream',
      'timed_mutex',
      'thread',
      'true_type',
      'tuple',
      'unique_lock',
      'unique_ptr',
      'unordered_map',
      'unordered_multimap',
      'unordered_multiset',
      'unordered_set',
      'variant',
      'vector',
      'weak_ptr',
      'wstring',
      'wstring_view'
    ];

    const FUNCTION_HINTS = [
      'abort',
      'abs',
      'acos',
      'apply',
      'as_const',
      'asin',
      'atan',
      'atan2',
      'calloc',
      'ceil',
      'cerr',
      'cin',
      'clog',
      'cos',
      'cosh',
      'cout',
      'declval',
      'endl',
      'exchange',
      'exit',
      'exp',
      'fabs',
      'floor',
      'fmod',
      'forward',
      'fprintf',
      'fputs',
      'free',
      'frexp',
      'fscanf',
      'future',
      'invoke',
      'isalnum',
      'isalpha',
      'iscntrl',
      'isdigit',
      'isgraph',
      'islower',
      'isprint',
      'ispunct',
      'isspace',
      'isupper',
      'isxdigit',
      'labs',
      'launder',
      'ldexp',
      'log',
      'log10',
      'make_pair',
      'make_shared',
      'make_shared_for_overwrite',
      'make_tuple',
      'make_unique',
      'malloc',
      'memchr',
      'memcmp',
      'memcpy',
      'memset',
      'modf',
      'move',
      'pow',
      'printf',
      'putchar',
      'puts',
      'realloc',
      'scanf',
      'sin',
      'sinh',
      'snprintf',
      'sprintf',
      'sqrt',
      'sscanf',
      'std',
      'stderr',
      'stdin',
      'stdout',
      'strcat',
      'strchr',
      'strcmp',
      'strcpy',
      'strcspn',
      'strlen',
      'strncat',
      'strncmp',
      'strncpy',
      'strpbrk',
      'strrchr',
      'strspn',
      'strstr',
      'swap',
      'tan',
      'tanh',
      'terminate',
      'to_underlying',
      'tolower',
      'toupper',
      'vfprintf',
      'visit',
      'vprintf',
      'vsprintf'
    ];

    const LITERALS = [
      'NULL',
      'false',
      'nullopt',
      'nullptr',
      'true'
    ];

    // https://en.cppreference.com/w/cpp/keyword
    const BUILT_IN = [ '_Pragma' ];

    const CPP_KEYWORDS = {
      type: RESERVED_TYPES,
      keyword: RESERVED_KEYWORDS,
      literal: LITERALS,
      built_in: BUILT_IN,
      _type_hints: TYPE_HINTS
    };

    const FUNCTION_DISPATCH = {
      className: 'function.dispatch',
      relevance: 0,
      keywords: {
        // Only for relevance, not highlighting.
        _hint: FUNCTION_HINTS },
      begin: regex.concat(
        /\b/,
        /(?!decltype)/,
        /(?!if)/,
        /(?!for)/,
        /(?!switch)/,
        /(?!while)/,
        hljs.IDENT_RE,
        regex.lookahead(/(<[^<>]+>|)\s*\(/))
    };

    const EXPRESSION_CONTAINS = [
      FUNCTION_DISPATCH,
      PREPROCESSOR,
      CPP_PRIMITIVE_TYPES,
      C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      NUMBERS,
      STRINGS
    ];

    const EXPRESSION_CONTEXT = {
      // This mode covers expression context where we can't expect a function
      // definition and shouldn't highlight anything that looks like one:
      // `return some()`, `else if()`, `(x*sum(1, 2))`
      variants: [
        {
          begin: /=/,
          end: /;/
        },
        {
          begin: /\(/,
          end: /\)/
        },
        {
          beginKeywords: 'new throw return else',
          end: /;/
        }
      ],
      keywords: CPP_KEYWORDS,
      contains: EXPRESSION_CONTAINS.concat([
        {
          begin: /\(/,
          end: /\)/,
          keywords: CPP_KEYWORDS,
          contains: EXPRESSION_CONTAINS.concat([ 'self' ]),
          relevance: 0
        }
      ]),
      relevance: 0
    };

    const FUNCTION_DECLARATION = {
      className: 'function',
      begin: '(' + FUNCTION_TYPE_RE + '[\\*&\\s]+)+' + FUNCTION_TITLE,
      returnBegin: true,
      end: /[{;=]/,
      excludeEnd: true,
      keywords: CPP_KEYWORDS,
      illegal: /[^\w\s\*&:<>.]/,
      contains: [
        { // to prevent it from being confused as the function title
          begin: DECLTYPE_AUTO_RE,
          keywords: CPP_KEYWORDS,
          relevance: 0
        },
        {
          begin: FUNCTION_TITLE,
          returnBegin: true,
          contains: [ TITLE_MODE ],
          relevance: 0
        },
        // needed because we do not have look-behind on the below rule
        // to prevent it from grabbing the final : in a :: pair
        {
          begin: /::/,
          relevance: 0
        },
        // initializers
        {
          begin: /:/,
          endsWithParent: true,
          contains: [
            STRINGS,
            NUMBERS
          ]
        },
        // allow for multiple declarations, e.g.:
        // extern void f(int), g(char);
        {
          relevance: 0,
          match: /,/
        },
        {
          className: 'params',
          begin: /\(/,
          end: /\)/,
          keywords: CPP_KEYWORDS,
          relevance: 0,
          contains: [
            C_LINE_COMMENT_MODE,
            hljs.C_BLOCK_COMMENT_MODE,
            STRINGS,
            NUMBERS,
            CPP_PRIMITIVE_TYPES,
            // Count matching parentheses.
            {
              begin: /\(/,
              end: /\)/,
              keywords: CPP_KEYWORDS,
              relevance: 0,
              contains: [
                'self',
                C_LINE_COMMENT_MODE,
                hljs.C_BLOCK_COMMENT_MODE,
                STRINGS,
                NUMBERS,
                CPP_PRIMITIVE_TYPES
              ]
            }
          ]
        },
        CPP_PRIMITIVE_TYPES,
        C_LINE_COMMENT_MODE,
        hljs.C_BLOCK_COMMENT_MODE,
        PREPROCESSOR
      ]
    };

    return {
      name: 'C++',
      aliases: [
        'cc',
        'c++',
        'h++',
        'hpp',
        'hh',
        'hxx',
        'cxx'
      ],
      keywords: CPP_KEYWORDS,
      illegal: '</',
      classNameAliases: { 'function.dispatch': 'built_in' },
      contains: [].concat(
        EXPRESSION_CONTEXT,
        FUNCTION_DECLARATION,
        FUNCTION_DISPATCH,
        EXPRESSION_CONTAINS,
        [
          PREPROCESSOR,
          { // containers: ie, `vector <int> rooms (9);`
            begin: '\\b(deque|list|queue|priority_queue|pair|stack|vector|map|set|bitset|multiset|multimap|unordered_map|unordered_set|unordered_multiset|unordered_multimap|array|tuple|optional|variant|function|flat_map|flat_set)\\s*<(?!<)',
            end: '>',
            keywords: CPP_KEYWORDS,
            contains: [
              'self',
              CPP_PRIMITIVE_TYPES
            ]
          },
          {
            begin: hljs.IDENT_RE + '::',
            keywords: CPP_KEYWORDS
          },
          {
            match: [
              // extra complexity to deal with `enum class` and `enum struct`
              /\b(?:enum(?:\s+(?:class|struct))?|class|struct|union)/,
              /\s+/,
              /\w+/
            ],
            className: {
              1: 'keyword',
              3: 'title.class'
            }
          }
        ])
    };
  }

  return cpp;

})();

    hljs.registerLanguage('cpp', hljsGrammar);
  })();/*! `csharp` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: C#
  Author: Jason Diamond <jason@diamond.name>
  Contributor: Nicolas LLOBERA <nllobera@gmail.com>, Pieter Vantorre <pietervantorre@gmail.com>, David Pine <david.pine@microsoft.com>
  Website: https://docs.microsoft.com/dotnet/csharp/
  Category: common
  */

  /** @type LanguageFn */
  function csharp(hljs) {
    const BUILT_IN_KEYWORDS = [
      'bool',
      'byte',
      'char',
      'decimal',
      'delegate',
      'double',
      'dynamic',
      'enum',
      'float',
      'int',
      'long',
      'nint',
      'nuint',
      'object',
      'sbyte',
      'short',
      'string',
      'ulong',
      'uint',
      'ushort'
    ];
    const FUNCTION_MODIFIERS = [
      'public',
      'private',
      'protected',
      'static',
      'internal',
      'protected',
      'abstract',
      'async',
      'extern',
      'override',
      'unsafe',
      'virtual',
      'new',
      'sealed',
      'partial'
    ];
    const LITERAL_KEYWORDS = [
      'default',
      'false',
      'null',
      'true'
    ];
    const NORMAL_KEYWORDS = [
      'abstract',
      'as',
      'base',
      'break',
      'case',
      'catch',
      'class',
      'const',
      'continue',
      'do',
      'else',
      'event',
      'explicit',
      'extern',
      'finally',
      'fixed',
      'for',
      'foreach',
      'goto',
      'if',
      'implicit',
      'in',
      'interface',
      'internal',
      'is',
      'lock',
      'namespace',
      'new',
      'operator',
      'out',
      'override',
      'params',
      'private',
      'protected',
      'public',
      'readonly',
      'record',
      'ref',
      'return',
      'scoped',
      'sealed',
      'sizeof',
      'stackalloc',
      'static',
      'struct',
      'switch',
      'this',
      'throw',
      'try',
      'typeof',
      'unchecked',
      'unsafe',
      'using',
      'virtual',
      'void',
      'volatile',
      'while'
    ];
    const CONTEXTUAL_KEYWORDS = [
      'add',
      'alias',
      'and',
      'ascending',
      'args',
      'async',
      'await',
      'by',
      'descending',
      'dynamic',
      'equals',
      'file',
      'from',
      'get',
      'global',
      'group',
      'init',
      'into',
      'join',
      'let',
      'nameof',
      'not',
      'notnull',
      'on',
      'or',
      'orderby',
      'partial',
      'record',
      'remove',
      'required',
      'scoped',
      'select',
      'set',
      'unmanaged',
      'value|0',
      'var',
      'when',
      'where',
      'with',
      'yield'
    ];

    const KEYWORDS = {
      keyword: NORMAL_KEYWORDS.concat(CONTEXTUAL_KEYWORDS),
      built_in: BUILT_IN_KEYWORDS,
      literal: LITERAL_KEYWORDS
    };
    const TITLE_MODE = hljs.inherit(hljs.TITLE_MODE, { begin: '[a-zA-Z](\\.?\\w)*' });
    const NUMBERS = {
      className: 'number',
      variants: [
        { begin: '\\b(0b[01\']+)' },
        { begin: '(-?)\\b([\\d\']+(\\.[\\d\']*)?|\\.[\\d\']+)(u|U|l|L|ul|UL|f|F|b|B)' },
        { begin: '(-?)(\\b0[xX][a-fA-F0-9\']+|(\\b[\\d\']+(\\.[\\d\']*)?|\\.[\\d\']+)([eE][-+]?[\\d\']+)?)' }
      ],
      relevance: 0
    };
    const RAW_STRING = {
      className: 'string',
      begin: /"""("*)(?!")(.|\n)*?"""\1/,
      relevance: 1
    };
    const VERBATIM_STRING = {
      className: 'string',
      begin: '@"',
      end: '"',
      contains: [ { begin: '""' } ]
    };
    const VERBATIM_STRING_NO_LF = hljs.inherit(VERBATIM_STRING, { illegal: /\n/ });
    const SUBST = {
      className: 'subst',
      begin: /\{/,
      end: /\}/,
      keywords: KEYWORDS
    };
    const SUBST_NO_LF = hljs.inherit(SUBST, { illegal: /\n/ });
    const INTERPOLATED_STRING = {
      className: 'string',
      begin: /\$"/,
      end: '"',
      illegal: /\n/,
      contains: [
        { begin: /\{\{/ },
        { begin: /\}\}/ },
        hljs.BACKSLASH_ESCAPE,
        SUBST_NO_LF
      ]
    };
    const INTERPOLATED_VERBATIM_STRING = {
      className: 'string',
      begin: /\$@"/,
      end: '"',
      contains: [
        { begin: /\{\{/ },
        { begin: /\}\}/ },
        { begin: '""' },
        SUBST
      ]
    };
    const INTERPOLATED_VERBATIM_STRING_NO_LF = hljs.inherit(INTERPOLATED_VERBATIM_STRING, {
      illegal: /\n/,
      contains: [
        { begin: /\{\{/ },
        { begin: /\}\}/ },
        { begin: '""' },
        SUBST_NO_LF
      ]
    });
    SUBST.contains = [
      INTERPOLATED_VERBATIM_STRING,
      INTERPOLATED_STRING,
      VERBATIM_STRING,
      hljs.APOS_STRING_MODE,
      hljs.QUOTE_STRING_MODE,
      NUMBERS,
      hljs.C_BLOCK_COMMENT_MODE
    ];
    SUBST_NO_LF.contains = [
      INTERPOLATED_VERBATIM_STRING_NO_LF,
      INTERPOLATED_STRING,
      VERBATIM_STRING_NO_LF,
      hljs.APOS_STRING_MODE,
      hljs.QUOTE_STRING_MODE,
      NUMBERS,
      hljs.inherit(hljs.C_BLOCK_COMMENT_MODE, { illegal: /\n/ })
    ];
    const STRING = { variants: [
      RAW_STRING,
      INTERPOLATED_VERBATIM_STRING,
      INTERPOLATED_STRING,
      VERBATIM_STRING,
      hljs.APOS_STRING_MODE,
      hljs.QUOTE_STRING_MODE
    ] };

    const GENERIC_MODIFIER = {
      begin: "<",
      end: ">",
      contains: [
        { beginKeywords: "in out" },
        TITLE_MODE
      ]
    };
    const TYPE_IDENT_RE = hljs.IDENT_RE + '(<' + hljs.IDENT_RE + '(\\s*,\\s*' + hljs.IDENT_RE + ')*>)?(\\[\\])?';
    const AT_IDENTIFIER = {
      // prevents expressions like `@class` from incorrect flagging
      // `class` as a keyword
      begin: "@" + hljs.IDENT_RE,
      relevance: 0
    };

    return {
      name: 'C#',
      aliases: [
        'cs',
        'c#'
      ],
      keywords: KEYWORDS,
      illegal: /::/,
      contains: [
        hljs.COMMENT(
          '///',
          '$',
          {
            returnBegin: true,
            contains: [
              {
                className: 'doctag',
                variants: [
                  {
                    begin: '///',
                    relevance: 0
                  },
                  { begin: '<!--|-->' },
                  {
                    begin: '</?',
                    end: '>'
                  }
                ]
              }
            ]
          }
        ),
        hljs.C_LINE_COMMENT_MODE,
        hljs.C_BLOCK_COMMENT_MODE,
        {
          className: 'meta',
          begin: '#',
          end: '$',
          keywords: { keyword: 'if else elif endif define undef warning error line region endregion pragma checksum' }
        },
        STRING,
        NUMBERS,
        {
          beginKeywords: 'class interface',
          relevance: 0,
          end: /[{;=]/,
          illegal: /[^\s:,]/,
          contains: [
            { beginKeywords: "where class" },
            TITLE_MODE,
            GENERIC_MODIFIER,
            hljs.C_LINE_COMMENT_MODE,
            hljs.C_BLOCK_COMMENT_MODE
          ]
        },
        {
          beginKeywords: 'namespace',
          relevance: 0,
          end: /[{;=]/,
          illegal: /[^\s:]/,
          contains: [
            TITLE_MODE,
            hljs.C_LINE_COMMENT_MODE,
            hljs.C_BLOCK_COMMENT_MODE
          ]
        },
        {
          beginKeywords: 'record',
          relevance: 0,
          end: /[{;=]/,
          illegal: /[^\s:]/,
          contains: [
            TITLE_MODE,
            GENERIC_MODIFIER,
            hljs.C_LINE_COMMENT_MODE,
            hljs.C_BLOCK_COMMENT_MODE
          ]
        },
        {
          // [Attributes("")]
          className: 'meta',
          begin: '^\\s*\\[(?=[\\w])',
          excludeBegin: true,
          end: '\\]',
          excludeEnd: true,
          contains: [
            {
              className: 'string',
              begin: /"/,
              end: /"/
            }
          ]
        },
        {
          // Expression keywords prevent 'keyword Name(...)' from being
          // recognized as a function definition
          beginKeywords: 'new return throw await else',
          relevance: 0
        },
        {
          className: 'function',
          begin: '(' + TYPE_IDENT_RE + '\\s+)+' + hljs.IDENT_RE + '\\s*(<[^=]+>\\s*)?\\(',
          returnBegin: true,
          end: /\s*[{;=]/,
          excludeEnd: true,
          keywords: KEYWORDS,
          contains: [
            // prevents these from being highlighted `title`
            {
              beginKeywords: FUNCTION_MODIFIERS.join(" "),
              relevance: 0
            },
            {
              begin: hljs.IDENT_RE + '\\s*(<[^=]+>\\s*)?\\(',
              returnBegin: true,
              contains: [
                hljs.TITLE_MODE,
                GENERIC_MODIFIER
              ],
              relevance: 0
            },
            { match: /\(\)/ },
            {
              className: 'params',
              begin: /\(/,
              end: /\)/,
              excludeBegin: true,
              excludeEnd: true,
              keywords: KEYWORDS,
              relevance: 0,
              contains: [
                STRING,
                NUMBERS,
                hljs.C_BLOCK_COMMENT_MODE
              ]
            },
            hljs.C_LINE_COMMENT_MODE,
            hljs.C_BLOCK_COMMENT_MODE
          ]
        },
        AT_IDENTIFIER
      ]
    };
  }

  return csharp;

})();

    hljs.registerLanguage('csharp', hljsGrammar);
  })();/*! `css` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  const MODES = (hljs) => {
    return {
      IMPORTANT: {
        scope: 'meta',
        begin: '!important'
      },
      BLOCK_COMMENT: hljs.C_BLOCK_COMMENT_MODE,
      HEXCOLOR: {
        scope: 'number',
        begin: /#(([0-9a-fA-F]{3,4})|(([0-9a-fA-F]{2}){3,4}))\b/
      },
      FUNCTION_DISPATCH: {
        className: "built_in",
        begin: /[\w-]+(?=\()/
      },
      ATTRIBUTE_SELECTOR_MODE: {
        scope: 'selector-attr',
        begin: /\[/,
        end: /\]/,
        illegal: '$',
        contains: [
          hljs.APOS_STRING_MODE,
          hljs.QUOTE_STRING_MODE
        ]
      },
      CSS_NUMBER_MODE: {
        scope: 'number',
        begin: hljs.NUMBER_RE + '(' +
          '%|em|ex|ch|rem' +
          '|vw|vh|vmin|vmax' +
          '|cm|mm|in|pt|pc|px' +
          '|deg|grad|rad|turn' +
          '|s|ms' +
          '|Hz|kHz' +
          '|dpi|dpcm|dppx' +
          ')?',
        relevance: 0
      },
      CSS_VARIABLE: {
        className: "attr",
        begin: /--[A-Za-z_][A-Za-z0-9_-]*/
      }
    };
  };

  const HTML_TAGS = [
    'a',
    'abbr',
    'address',
    'article',
    'aside',
    'audio',
    'b',
    'blockquote',
    'body',
    'button',
    'canvas',
    'caption',
    'cite',
    'code',
    'dd',
    'del',
    'details',
    'dfn',
    'div',
    'dl',
    'dt',
    'em',
    'fieldset',
    'figcaption',
    'figure',
    'footer',
    'form',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'header',
    'hgroup',
    'html',
    'i',
    'iframe',
    'img',
    'input',
    'ins',
    'kbd',
    'label',
    'legend',
    'li',
    'main',
    'mark',
    'menu',
    'nav',
    'object',
    'ol',
    'optgroup',
    'option',
    'p',
    'picture',
    'q',
    'quote',
    'samp',
    'section',
    'select',
    'source',
    'span',
    'strong',
    'summary',
    'sup',
    'table',
    'tbody',
    'td',
    'textarea',
    'tfoot',
    'th',
    'thead',
    'time',
    'tr',
    'ul',
    'var',
    'video'
  ];

  const SVG_TAGS = [
    'defs',
    'g',
    'marker',
    'mask',
    'pattern',
    'svg',
    'switch',
    'symbol',
    'feBlend',
    'feColorMatrix',
    'feComponentTransfer',
    'feComposite',
    'feConvolveMatrix',
    'feDiffuseLighting',
    'feDisplacementMap',
    'feFlood',
    'feGaussianBlur',
    'feImage',
    'feMerge',
    'feMorphology',
    'feOffset',
    'feSpecularLighting',
    'feTile',
    'feTurbulence',
    'linearGradient',
    'radialGradient',
    'stop',
    'circle',
    'ellipse',
    'image',
    'line',
    'path',
    'polygon',
    'polyline',
    'rect',
    'text',
    'use',
    'textPath',
    'tspan',
    'foreignObject',
    'clipPath'
  ];

  const TAGS = [
    ...HTML_TAGS,
    ...SVG_TAGS,
  ];

  // Sorting, then reversing makes sure longer attributes/elements like
  // `font-weight` are matched fully instead of getting false positives on say `font`

  const MEDIA_FEATURES = [
    'any-hover',
    'any-pointer',
    'aspect-ratio',
    'color',
    'color-gamut',
    'color-index',
    'device-aspect-ratio',
    'device-height',
    'device-width',
    'display-mode',
    'forced-colors',
    'grid',
    'height',
    'hover',
    'inverted-colors',
    'monochrome',
    'orientation',
    'overflow-block',
    'overflow-inline',
    'pointer',
    'prefers-color-scheme',
    'prefers-contrast',
    'prefers-reduced-motion',
    'prefers-reduced-transparency',
    'resolution',
    'scan',
    'scripting',
    'update',
    'width',
    // TODO: find a better solution?
    'min-width',
    'max-width',
    'min-height',
    'max-height'
  ].sort().reverse();

  // https://developer.mozilla.org/en-US/docs/Web/CSS/Pseudo-classes
  const PSEUDO_CLASSES = [
    'active',
    'any-link',
    'blank',
    'checked',
    'current',
    'default',
    'defined',
    'dir', // dir()
    'disabled',
    'drop',
    'empty',
    'enabled',
    'first',
    'first-child',
    'first-of-type',
    'fullscreen',
    'future',
    'focus',
    'focus-visible',
    'focus-within',
    'has', // has()
    'host', // host or host()
    'host-context', // host-context()
    'hover',
    'indeterminate',
    'in-range',
    'invalid',
    'is', // is()
    'lang', // lang()
    'last-child',
    'last-of-type',
    'left',
    'link',
    'local-link',
    'not', // not()
    'nth-child', // nth-child()
    'nth-col', // nth-col()
    'nth-last-child', // nth-last-child()
    'nth-last-col', // nth-last-col()
    'nth-last-of-type', //nth-last-of-type()
    'nth-of-type', //nth-of-type()
    'only-child',
    'only-of-type',
    'optional',
    'out-of-range',
    'past',
    'placeholder-shown',
    'read-only',
    'read-write',
    'required',
    'right',
    'root',
    'scope',
    'target',
    'target-within',
    'user-invalid',
    'valid',
    'visited',
    'where' // where()
  ].sort().reverse();

  // https://developer.mozilla.org/en-US/docs/Web/CSS/Pseudo-elements
  const PSEUDO_ELEMENTS = [
    'after',
    'backdrop',
    'before',
    'cue',
    'cue-region',
    'first-letter',
    'first-line',
    'grammar-error',
    'marker',
    'part',
    'placeholder',
    'selection',
    'slotted',
    'spelling-error'
  ].sort().reverse();

  const ATTRIBUTES = [
    'accent-color',
    'align-content',
    'align-items',
    'align-self',
    'alignment-baseline',
    'all',
    'anchor-name',
    'animation',
    'animation-composition',
    'animation-delay',
    'animation-direction',
    'animation-duration',
    'animation-fill-mode',
    'animation-iteration-count',
    'animation-name',
    'animation-play-state',
    'animation-range',
    'animation-range-end',
    'animation-range-start',
    'animation-timeline',
    'animation-timing-function',
    'appearance',
    'aspect-ratio',
    'backdrop-filter',
    'backface-visibility',
    'background',
    'background-attachment',
    'background-blend-mode',
    'background-clip',
    'background-color',
    'background-image',
    'background-origin',
    'background-position',
    'background-position-x',
    'background-position-y',
    'background-repeat',
    'background-size',
    'baseline-shift',
    'block-size',
    'border',
    'border-block',
    'border-block-color',
    'border-block-end',
    'border-block-end-color',
    'border-block-end-style',
    'border-block-end-width',
    'border-block-start',
    'border-block-start-color',
    'border-block-start-style',
    'border-block-start-width',
    'border-block-style',
    'border-block-width',
    'border-bottom',
    'border-bottom-color',
    'border-bottom-left-radius',
    'border-bottom-right-radius',
    'border-bottom-style',
    'border-bottom-width',
    'border-collapse',
    'border-color',
    'border-end-end-radius',
    'border-end-start-radius',
    'border-image',
    'border-image-outset',
    'border-image-repeat',
    'border-image-slice',
    'border-image-source',
    'border-image-width',
    'border-inline',
    'border-inline-color',
    'border-inline-end',
    'border-inline-end-color',
    'border-inline-end-style',
    'border-inline-end-width',
    'border-inline-start',
    'border-inline-start-color',
    'border-inline-start-style',
    'border-inline-start-width',
    'border-inline-style',
    'border-inline-width',
    'border-left',
    'border-left-color',
    'border-left-style',
    'border-left-width',
    'border-radius',
    'border-right',
    'border-right-color',
    'border-right-style',
    'border-right-width',
    'border-spacing',
    'border-start-end-radius',
    'border-start-start-radius',
    'border-style',
    'border-top',
    'border-top-color',
    'border-top-left-radius',
    'border-top-right-radius',
    'border-top-style',
    'border-top-width',
    'border-width',
    'bottom',
    'box-align',
    'box-decoration-break',
    'box-direction',
    'box-flex',
    'box-flex-group',
    'box-lines',
    'box-ordinal-group',
    'box-orient',
    'box-pack',
    'box-shadow',
    'box-sizing',
    'break-after',
    'break-before',
    'break-inside',
    'caption-side',
    'caret-color',
    'clear',
    'clip',
    'clip-path',
    'clip-rule',
    'color',
    'color-interpolation',
    'color-interpolation-filters',
    'color-profile',
    'color-rendering',
    'color-scheme',
    'column-count',
    'column-fill',
    'column-gap',
    'column-rule',
    'column-rule-color',
    'column-rule-style',
    'column-rule-width',
    'column-span',
    'column-width',
    'columns',
    'contain',
    'contain-intrinsic-block-size',
    'contain-intrinsic-height',
    'contain-intrinsic-inline-size',
    'contain-intrinsic-size',
    'contain-intrinsic-width',
    'container',
    'container-name',
    'container-type',
    'content',
    'content-visibility',
    'counter-increment',
    'counter-reset',
    'counter-set',
    'cue',
    'cue-after',
    'cue-before',
    'cursor',
    'cx',
    'cy',
    'direction',
    'display',
    'dominant-baseline',
    'empty-cells',
    'enable-background',
    'field-sizing',
    'fill',
    'fill-opacity',
    'fill-rule',
    'filter',
    'flex',
    'flex-basis',
    'flex-direction',
    'flex-flow',
    'flex-grow',
    'flex-shrink',
    'flex-wrap',
    'float',
    'flood-color',
    'flood-opacity',
    'flow',
    'font',
    'font-display',
    'font-family',
    'font-feature-settings',
    'font-kerning',
    'font-language-override',
    'font-optical-sizing',
    'font-palette',
    'font-size',
    'font-size-adjust',
    'font-smooth',
    'font-smoothing',
    'font-stretch',
    'font-style',
    'font-synthesis',
    'font-synthesis-position',
    'font-synthesis-small-caps',
    'font-synthesis-style',
    'font-synthesis-weight',
    'font-variant',
    'font-variant-alternates',
    'font-variant-caps',
    'font-variant-east-asian',
    'font-variant-emoji',
    'font-variant-ligatures',
    'font-variant-numeric',
    'font-variant-position',
    'font-variation-settings',
    'font-weight',
    'forced-color-adjust',
    'gap',
    'glyph-orientation-horizontal',
    'glyph-orientation-vertical',
    'grid',
    'grid-area',
    'grid-auto-columns',
    'grid-auto-flow',
    'grid-auto-rows',
    'grid-column',
    'grid-column-end',
    'grid-column-start',
    'grid-gap',
    'grid-row',
    'grid-row-end',
    'grid-row-start',
    'grid-template',
    'grid-template-areas',
    'grid-template-columns',
    'grid-template-rows',
    'hanging-punctuation',
    'height',
    'hyphenate-character',
    'hyphenate-limit-chars',
    'hyphens',
    'icon',
    'image-orientation',
    'image-rendering',
    'image-resolution',
    'ime-mode',
    'initial-letter',
    'initial-letter-align',
    'inline-size',
    'inset',
    'inset-area',
    'inset-block',
    'inset-block-end',
    'inset-block-start',
    'inset-inline',
    'inset-inline-end',
    'inset-inline-start',
    'isolation',
    'justify-content',
    'justify-items',
    'justify-self',
    'kerning',
    'left',
    'letter-spacing',
    'lighting-color',
    'line-break',
    'line-height',
    'line-height-step',
    'list-style',
    'list-style-image',
    'list-style-position',
    'list-style-type',
    'margin',
    'margin-block',
    'margin-block-end',
    'margin-block-start',
    'margin-bottom',
    'margin-inline',
    'margin-inline-end',
    'margin-inline-start',
    'margin-left',
    'margin-right',
    'margin-top',
    'margin-trim',
    'marker',
    'marker-end',
    'marker-mid',
    'marker-start',
    'marks',
    'mask',
    'mask-border',
    'mask-border-mode',
    'mask-border-outset',
    'mask-border-repeat',
    'mask-border-slice',
    'mask-border-source',
    'mask-border-width',
    'mask-clip',
    'mask-composite',
    'mask-image',
    'mask-mode',
    'mask-origin',
    'mask-position',
    'mask-repeat',
    'mask-size',
    'mask-type',
    'masonry-auto-flow',
    'math-depth',
    'math-shift',
    'math-style',
    'max-block-size',
    'max-height',
    'max-inline-size',
    'max-width',
    'min-block-size',
    'min-height',
    'min-inline-size',
    'min-width',
    'mix-blend-mode',
    'nav-down',
    'nav-index',
    'nav-left',
    'nav-right',
    'nav-up',
    'none',
    'normal',
    'object-fit',
    'object-position',
    'offset',
    'offset-anchor',
    'offset-distance',
    'offset-path',
    'offset-position',
    'offset-rotate',
    'opacity',
    'order',
    'orphans',
    'outline',
    'outline-color',
    'outline-offset',
    'outline-style',
    'outline-width',
    'overflow',
    'overflow-anchor',
    'overflow-block',
    'overflow-clip-margin',
    'overflow-inline',
    'overflow-wrap',
    'overflow-x',
    'overflow-y',
    'overlay',
    'overscroll-behavior',
    'overscroll-behavior-block',
    'overscroll-behavior-inline',
    'overscroll-behavior-x',
    'overscroll-behavior-y',
    'padding',
    'padding-block',
    'padding-block-end',
    'padding-block-start',
    'padding-bottom',
    'padding-inline',
    'padding-inline-end',
    'padding-inline-start',
    'padding-left',
    'padding-right',
    'padding-top',
    'page',
    'page-break-after',
    'page-break-before',
    'page-break-inside',
    'paint-order',
    'pause',
    'pause-after',
    'pause-before',
    'perspective',
    'perspective-origin',
    'place-content',
    'place-items',
    'place-self',
    'pointer-events',
    'position',
    'position-anchor',
    'position-visibility',
    'print-color-adjust',
    'quotes',
    'r',
    'resize',
    'rest',
    'rest-after',
    'rest-before',
    'right',
    'rotate',
    'row-gap',
    'ruby-align',
    'ruby-position',
    'scale',
    'scroll-behavior',
    'scroll-margin',
    'scroll-margin-block',
    'scroll-margin-block-end',
    'scroll-margin-block-start',
    'scroll-margin-bottom',
    'scroll-margin-inline',
    'scroll-margin-inline-end',
    'scroll-margin-inline-start',
    'scroll-margin-left',
    'scroll-margin-right',
    'scroll-margin-top',
    'scroll-padding',
    'scroll-padding-block',
    'scroll-padding-block-end',
    'scroll-padding-block-start',
    'scroll-padding-bottom',
    'scroll-padding-inline',
    'scroll-padding-inline-end',
    'scroll-padding-inline-start',
    'scroll-padding-left',
    'scroll-padding-right',
    'scroll-padding-top',
    'scroll-snap-align',
    'scroll-snap-stop',
    'scroll-snap-type',
    'scroll-timeline',
    'scroll-timeline-axis',
    'scroll-timeline-name',
    'scrollbar-color',
    'scrollbar-gutter',
    'scrollbar-width',
    'shape-image-threshold',
    'shape-margin',
    'shape-outside',
    'shape-rendering',
    'speak',
    'speak-as',
    'src', // @font-face
    'stop-color',
    'stop-opacity',
    'stroke',
    'stroke-dasharray',
    'stroke-dashoffset',
    'stroke-linecap',
    'stroke-linejoin',
    'stroke-miterlimit',
    'stroke-opacity',
    'stroke-width',
    'tab-size',
    'table-layout',
    'text-align',
    'text-align-all',
    'text-align-last',
    'text-anchor',
    'text-combine-upright',
    'text-decoration',
    'text-decoration-color',
    'text-decoration-line',
    'text-decoration-skip',
    'text-decoration-skip-ink',
    'text-decoration-style',
    'text-decoration-thickness',
    'text-emphasis',
    'text-emphasis-color',
    'text-emphasis-position',
    'text-emphasis-style',
    'text-indent',
    'text-justify',
    'text-orientation',
    'text-overflow',
    'text-rendering',
    'text-shadow',
    'text-size-adjust',
    'text-transform',
    'text-underline-offset',
    'text-underline-position',
    'text-wrap',
    'text-wrap-mode',
    'text-wrap-style',
    'timeline-scope',
    'top',
    'touch-action',
    'transform',
    'transform-box',
    'transform-origin',
    'transform-style',
    'transition',
    'transition-behavior',
    'transition-delay',
    'transition-duration',
    'transition-property',
    'transition-timing-function',
    'translate',
    'unicode-bidi',
    'user-modify',
    'user-select',
    'vector-effect',
    'vertical-align',
    'view-timeline',
    'view-timeline-axis',
    'view-timeline-inset',
    'view-timeline-name',
    'view-transition-name',
    'visibility',
    'voice-balance',
    'voice-duration',
    'voice-family',
    'voice-pitch',
    'voice-range',
    'voice-rate',
    'voice-stress',
    'voice-volume',
    'white-space',
    'white-space-collapse',
    'widows',
    'width',
    'will-change',
    'word-break',
    'word-spacing',
    'word-wrap',
    'writing-mode',
    'x',
    'y',
    'z-index',
    'zoom'
  ].sort().reverse();

  /*
  Language: CSS
  Category: common, css, web
  Website: https://developer.mozilla.org/en-US/docs/Web/CSS
  */


  /** @type LanguageFn */
  function css(hljs) {
    const regex = hljs.regex;
    const modes = MODES(hljs);
    const VENDOR_PREFIX = { begin: /-(webkit|moz|ms|o)-(?=[a-z])/ };
    const AT_MODIFIERS = "and or not only";
    const AT_PROPERTY_RE = /@-?\w[\w]*(-\w+)*/; // @-webkit-keyframes
    const IDENT_RE = '[a-zA-Z-][a-zA-Z0-9_-]*';
    const STRINGS = [
      hljs.APOS_STRING_MODE,
      hljs.QUOTE_STRING_MODE
    ];

    return {
      name: 'CSS',
      case_insensitive: true,
      illegal: /[=|'\$]/,
      keywords: { keyframePosition: "from to" },
      classNameAliases: {
        // for visual continuity with `tag {}` and because we
        // don't have a great class for this?
        keyframePosition: "selector-tag" },
      contains: [
        modes.BLOCK_COMMENT,
        VENDOR_PREFIX,
        // to recognize keyframe 40% etc which are outside the scope of our
        // attribute value mode
        modes.CSS_NUMBER_MODE,
        {
          className: 'selector-id',
          begin: /#[A-Za-z0-9_-]+/,
          relevance: 0
        },
        {
          className: 'selector-class',
          begin: '\\.' + IDENT_RE,
          relevance: 0
        },
        modes.ATTRIBUTE_SELECTOR_MODE,
        {
          className: 'selector-pseudo',
          variants: [
            { begin: ':(' + PSEUDO_CLASSES.join('|') + ')' },
            { begin: ':(:)?(' + PSEUDO_ELEMENTS.join('|') + ')' }
          ]
        },
        // we may actually need this (12/2020)
        // { // pseudo-selector params
        //   begin: /\(/,
        //   end: /\)/,
        //   contains: [ hljs.CSS_NUMBER_MODE ]
        // },
        modes.CSS_VARIABLE,
        {
          className: 'attribute',
          begin: '\\b(' + ATTRIBUTES.join('|') + ')\\b'
        },
        // attribute values
        {
          begin: /:/,
          end: /[;}{]/,
          contains: [
            modes.BLOCK_COMMENT,
            modes.HEXCOLOR,
            modes.IMPORTANT,
            modes.CSS_NUMBER_MODE,
            ...STRINGS,
            // needed to highlight these as strings and to avoid issues with
            // illegal characters that might be inside urls that would tigger the
            // languages illegal stack
            {
              begin: /(url|data-uri)\(/,
              end: /\)/,
              relevance: 0, // from keywords
              keywords: { built_in: "url data-uri" },
              contains: [
                ...STRINGS,
                {
                  className: "string",
                  // any character other than `)` as in `url()` will be the start
                  // of a string, which ends with `)` (from the parent mode)
                  begin: /[^)]/,
                  endsWithParent: true,
                  excludeEnd: true
                }
              ]
            },
            modes.FUNCTION_DISPATCH
          ]
        },
        {
          begin: regex.lookahead(/@/),
          end: '[{;]',
          relevance: 0,
          illegal: /:/, // break on Less variables @var: ...
          contains: [
            {
              className: 'keyword',
              begin: AT_PROPERTY_RE
            },
            {
              begin: /\s/,
              endsWithParent: true,
              excludeEnd: true,
              relevance: 0,
              keywords: {
                $pattern: /[a-z-]+/,
                keyword: AT_MODIFIERS,
                attribute: MEDIA_FEATURES.join(" ")
              },
              contains: [
                {
                  begin: /[a-z-]+(?=:)/,
                  className: "attribute"
                },
                ...STRINGS,
                modes.CSS_NUMBER_MODE
              ]
            }
          ]
        },
        {
          className: 'selector-tag',
          begin: '\\b(' + TAGS.join('|') + ')\\b'
        }
      ]
    };
  }

  return css;

})();

    hljs.registerLanguage('css', hljsGrammar);
  })();/*! `dart` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Dart
  Requires: markdown.js
  Author: Maxim Dikun <dikmax@gmail.com>
  Description: Dart a modern, object-oriented language developed by Google. For more information see https://www.dartlang.org/
  Website: https://dart.dev
  Category: scripting
  */

  /** @type LanguageFn */
  function dart(hljs) {
    const SUBST = {
      className: 'subst',
      variants: [ { begin: '\\$[A-Za-z0-9_]+' } ]
    };

    const BRACED_SUBST = {
      className: 'subst',
      variants: [
        {
          begin: /\$\{/,
          end: /\}/
        }
      ],
      keywords: 'true false null this is new super'
    };

    const NUMBER = {
      className: 'number',
      relevance: 0,
      variants: [
        { match: /\b[0-9][0-9_]*(\.[0-9][0-9_]*)?([eE][+-]?[0-9][0-9_]*)?\b/ },
        { match: /\b0[xX][0-9A-Fa-f][0-9A-Fa-f_]*\b/ }
      ]
    };

    const STRING = {
      className: 'string',
      variants: [
        {
          begin: 'r\'\'\'',
          end: '\'\'\''
        },
        {
          begin: 'r"""',
          end: '"""'
        },
        {
          begin: 'r\'',
          end: '\'',
          illegal: '\\n'
        },
        {
          begin: 'r"',
          end: '"',
          illegal: '\\n'
        },
        {
          begin: '\'\'\'',
          end: '\'\'\'',
          contains: [
            hljs.BACKSLASH_ESCAPE,
            SUBST,
            BRACED_SUBST
          ]
        },
        {
          begin: '"""',
          end: '"""',
          contains: [
            hljs.BACKSLASH_ESCAPE,
            SUBST,
            BRACED_SUBST
          ]
        },
        {
          begin: '\'',
          end: '\'',
          illegal: '\\n',
          contains: [
            hljs.BACKSLASH_ESCAPE,
            SUBST,
            BRACED_SUBST
          ]
        },
        {
          begin: '"',
          end: '"',
          illegal: '\\n',
          contains: [
            hljs.BACKSLASH_ESCAPE,
            SUBST,
            BRACED_SUBST
          ]
        }
      ]
    };
    BRACED_SUBST.contains = [
      NUMBER,
      STRING
    ];

    const BUILT_IN_TYPES = [
      // dart:core
      'Comparable',
      'DateTime',
      'Duration',
      'Function',
      'Iterable',
      'Iterator',
      'List',
      'Map',
      'Match',
      'Object',
      'Pattern',
      'RegExp',
      'Set',
      'Stopwatch',
      'String',
      'StringBuffer',
      'StringSink',
      'Symbol',
      'Type',
      'Uri',
      'bool',
      'double',
      'int',
      'num',
      // dart:html
      'Element',
      'ElementList'
    ];
    const NULLABLE_BUILT_IN_TYPES = BUILT_IN_TYPES.map((e) => `${e}?`);

    const BASIC_KEYWORDS = [
      "abstract",
      "as",
      "assert",
      "async",
      "await",
      "base",
      "break",
      "case",
      "catch",
      "class",
      "const",
      "continue",
      "covariant",
      "default",
      "deferred",
      "do",
      "dynamic",
      "else",
      "enum",
      "export",
      "extends",
      "extension",
      "external",
      "factory",
      "false",
      "final",
      "finally",
      "for",
      "Function",
      "get",
      "hide",
      "if",
      "implements",
      "import",
      "in",
      "interface",
      "is",
      "late",
      "library",
      "mixin",
      "new",
      "null",
      "on",
      "operator",
      "part",
      "required",
      "rethrow",
      "return",
      "sealed",
      "set",
      "show",
      "static",
      "super",
      "switch",
      "sync",
      "this",
      "throw",
      "true",
      "try",
      "typedef",
      "var",
      "void",
      "when",
      "while",
      "with",
      "yield"
    ];

    const KEYWORDS = {
      keyword: BASIC_KEYWORDS,
      built_in:
        BUILT_IN_TYPES
          .concat(NULLABLE_BUILT_IN_TYPES)
          .concat([
            // dart:core
            'Never',
            'Null',
            'dynamic',
            'print',
            // dart:html
            'document',
            'querySelector',
            'querySelectorAll',
            'window'
          ]),
      $pattern: /[A-Za-z][A-Za-z0-9_]*\??/
    };

    return {
      name: 'Dart',
      keywords: KEYWORDS,
      contains: [
        STRING,
        hljs.COMMENT(
          /\/\*\*(?!\/)/,
          /\*\//,
          {
            subLanguage: 'markdown',
            relevance: 0
          }
        ),
        hljs.COMMENT(
          /\/{3,} ?/,
          /$/, { contains: [
            {
              subLanguage: 'markdown',
              begin: '.',
              end: '$',
              relevance: 0
            }
          ] }
        ),
        hljs.C_LINE_COMMENT_MODE,
        hljs.C_BLOCK_COMMENT_MODE,
        {
          className: 'class',
          beginKeywords: 'class interface',
          end: /\{/,
          excludeEnd: true,
          contains: [
            { beginKeywords: 'extends implements' },
            hljs.UNDERSCORE_TITLE_MODE
          ]
        },
        NUMBER,
        {
          className: 'meta',
          begin: '@[A-Za-z]+'
        },
        { begin: '=>' // No markup, just a relevance booster
        }
      ]
    };
  }

  return dart;

})();

    hljs.registerLanguage('dart', hljsGrammar);
  })();/*! `diff` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Diff
  Description: Unified and context diff
  Author: Vasily Polovnyov <vast@whiteants.net>
  Website: https://www.gnu.org/software/diffutils/
  Category: common
  */

  /** @type LanguageFn */
  function diff(hljs) {
    const regex = hljs.regex;
    return {
      name: 'Diff',
      aliases: [ 'patch' ],
      contains: [
        {
          className: 'meta',
          relevance: 10,
          match: regex.either(
            /^@@ +-\d+,\d+ +\+\d+,\d+ +@@/,
            /^\*\*\* +\d+,\d+ +\*\*\*\*$/,
            /^--- +\d+,\d+ +----$/
          )
        },
        {
          className: 'comment',
          variants: [
            {
              begin: regex.either(
                /Index: /,
                /^index/,
                /={3,}/,
                /^-{3}/,
                /^\*{3} /,
                /^\+{3}/,
                /^diff --git/
              ),
              end: /$/
            },
            { match: /^\*{15}$/ }
          ]
        },
        {
          className: 'addition',
          begin: /^\+/,
          end: /$/
        },
        {
          className: 'deletion',
          begin: /^-/,
          end: /$/
        },
        {
          className: 'addition',
          begin: /^!/,
          end: /$/
        }
      ]
    };
  }

  return diff;

})();

    hljs.registerLanguage('diff', hljsGrammar);
  })();/*! `django` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Django
  Description: Django is a high-level Python Web framework that encourages rapid development and clean, pragmatic design.
  Requires: xml.js
  Author: Ivan Sagalaev <maniac@softwaremaniacs.org>
  Contributors: Ilya Baryshev <baryshev@gmail.com>
  Website: https://www.djangoproject.com
  Category: template
  */

  /** @type LanguageFn */
  function django(hljs) {
    const FILTER = {
      begin: /\|[A-Za-z]+:?/,
      keywords: { name:
          'truncatewords removetags linebreaksbr yesno get_digit timesince random striptags '
          + 'filesizeformat escape linebreaks length_is ljust rjust cut urlize fix_ampersands '
          + 'title floatformat capfirst pprint divisibleby add make_list unordered_list urlencode '
          + 'timeuntil urlizetrunc wordcount stringformat linenumbers slice date dictsort '
          + 'dictsortreversed default_if_none pluralize lower join center default '
          + 'truncatewords_html upper length phone2numeric wordwrap time addslashes slugify first '
          + 'escapejs force_escape iriencode last safe safeseq truncatechars localize unlocalize '
          + 'localtime utc timezone' },
      contains: [
        hljs.QUOTE_STRING_MODE,
        hljs.APOS_STRING_MODE
      ]
    };

    return {
      name: 'Django',
      aliases: [ 'jinja' ],
      case_insensitive: true,
      subLanguage: 'xml',
      contains: [
        hljs.COMMENT(/\{%\s*comment\s*%\}/, /\{%\s*endcomment\s*%\}/),
        hljs.COMMENT(/\{#/, /#\}/),
        {
          className: 'template-tag',
          begin: /\{%/,
          end: /%\}/,
          contains: [
            {
              className: 'name',
              begin: /\w+/,
              keywords: { name:
                  'comment endcomment load templatetag ifchanged endifchanged if endif firstof for '
                  + 'endfor ifnotequal endifnotequal widthratio extends include spaceless '
                  + 'endspaceless regroup ifequal endifequal ssi now with cycle url filter '
                  + 'endfilter debug block endblock else autoescape endautoescape csrf_token empty elif '
                  + 'endwith static trans blocktrans endblocktrans get_static_prefix get_media_prefix '
                  + 'plural get_current_language language get_available_languages '
                  + 'get_current_language_bidi get_language_info get_language_info_list localize '
                  + 'endlocalize localtime endlocaltime timezone endtimezone get_current_timezone '
                  + 'verbatim' },
              starts: {
                endsWithParent: true,
                keywords: 'in by as',
                contains: [ FILTER ],
                relevance: 0
              }
            }
          ]
        },
        {
          className: 'template-variable',
          begin: /\{\{/,
          end: /\}\}/,
          contains: [ FILTER ]
        }
      ]
    };
  }

  return django;

})();

    hljs.registerLanguage('django', hljsGrammar);
  })();/*! `dockerfile` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Dockerfile
  Requires: bash.js
  Author: Alexis Hénaut <alexis@henaut.net>
  Description: language definition for Dockerfile files
  Website: https://docs.docker.com/engine/reference/builder/
  Category: config
  */

  /** @type LanguageFn */
  function dockerfile(hljs) {
    const KEYWORDS = [
      "from",
      "maintainer",
      "expose",
      "env",
      "arg",
      "user",
      "onbuild",
      "stopsignal"
    ];
    return {
      name: 'Dockerfile',
      aliases: [ 'docker' ],
      case_insensitive: true,
      keywords: KEYWORDS,
      contains: [
        hljs.HASH_COMMENT_MODE,
        hljs.APOS_STRING_MODE,
        hljs.QUOTE_STRING_MODE,
        hljs.NUMBER_MODE,
        {
          beginKeywords: 'run cmd entrypoint volume add copy workdir label healthcheck shell',
          starts: {
            end: /[^\\]$/,
            subLanguage: 'bash'
          }
        }
      ],
      illegal: '</'
    };
  }

  return dockerfile;

})();

    hljs.registerLanguage('dockerfile', hljsGrammar);
  })();/*! `elixir` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Elixir
  Author: Josh Adams <josh@isotope11.com>
  Description: language definition for Elixir source code files (.ex and .exs).  Based on ruby language support.
  Category: functional
  Website: https://elixir-lang.org
  */

  /** @type LanguageFn */
  function elixir(hljs) {
    const regex = hljs.regex;
    const ELIXIR_IDENT_RE = '[a-zA-Z_][a-zA-Z0-9_.]*(!|\\?)?';
    const ELIXIR_METHOD_RE = '[a-zA-Z_]\\w*[!?=]?|[-+~]@|<<|>>|=~|===?|<=>|[<>]=?|\\*\\*|[-/+%^&*~`|]|\\[\\]=?';
    const KEYWORDS = [
      "after",
      "alias",
      "and",
      "case",
      "catch",
      "cond",
      "defstruct",
      "defguard",
      "do",
      "else",
      "end",
      "fn",
      "for",
      "if",
      "import",
      "in",
      "not",
      "or",
      "quote",
      "raise",
      "receive",
      "require",
      "reraise",
      "rescue",
      "try",
      "unless",
      "unquote",
      "unquote_splicing",
      "use",
      "when",
      "with|0"
    ];
    const LITERALS = [
      "false",
      "nil",
      "true"
    ];
    const KWS = {
      $pattern: ELIXIR_IDENT_RE,
      keyword: KEYWORDS,
      literal: LITERALS
    };
    const SUBST = {
      className: 'subst',
      begin: /#\{/,
      end: /\}/,
      keywords: KWS
    };
    const NUMBER = {
      className: 'number',
      begin: '(\\b0o[0-7_]+)|(\\b0b[01_]+)|(\\b0x[0-9a-fA-F_]+)|(-?\\b[0-9][0-9_]*(\\.[0-9_]+([eE][-+]?[0-9]+)?)?)',
      relevance: 0
    };
    // TODO: could be tightened
    // https://elixir-lang.readthedocs.io/en/latest/intro/18.html
    // but you also need to include closing delemeters in the escape list per
    // individual sigil mode from what I can tell,
    // ie: \} might or might not be an escape depending on the sigil used
    const ESCAPES_RE = /\\[\s\S]/;
    // const ESCAPES_RE = /\\["'\\abdefnrstv0]/;
    const BACKSLASH_ESCAPE = {
      match: ESCAPES_RE,
      scope: "char.escape",
      relevance: 0
    };
    const SIGIL_DELIMITERS = '[/|([{<"\']';
    const SIGIL_DELIMITER_MODES = [
      {
        begin: /"/,
        end: /"/
      },
      {
        begin: /'/,
        end: /'/
      },
      {
        begin: /\//,
        end: /\//
      },
      {
        begin: /\|/,
        end: /\|/
      },
      {
        begin: /\(/,
        end: /\)/
      },
      {
        begin: /\[/,
        end: /\]/
      },
      {
        begin: /\{/,
        end: /\}/
      },
      {
        begin: /</,
        end: />/
      }
    ];
    const escapeSigilEnd = (end) => {
      return {
        scope: "char.escape",
        begin: regex.concat(/\\/, end),
        relevance: 0
      };
    };
    const LOWERCASE_SIGIL = {
      className: 'string',
      begin: '~[a-z]' + '(?=' + SIGIL_DELIMITERS + ')',
      contains: SIGIL_DELIMITER_MODES.map(x => hljs.inherit(x,
        { contains: [
          escapeSigilEnd(x.end),
          BACKSLASH_ESCAPE,
          SUBST
        ] }
      ))
    };

    const UPCASE_SIGIL = {
      className: 'string',
      begin: '~[A-Z]' + '(?=' + SIGIL_DELIMITERS + ')',
      contains: SIGIL_DELIMITER_MODES.map(x => hljs.inherit(x,
        { contains: [ escapeSigilEnd(x.end) ] }
      ))
    };

    const REGEX_SIGIL = {
      className: 'regex',
      variants: [
        {
          begin: '~r' + '(?=' + SIGIL_DELIMITERS + ')',
          contains: SIGIL_DELIMITER_MODES.map(x => hljs.inherit(x,
            {
              end: regex.concat(x.end, /[uismxfU]{0,7}/),
              contains: [
                escapeSigilEnd(x.end),
                BACKSLASH_ESCAPE,
                SUBST
              ]
            }
          ))
        },
        {
          begin: '~R' + '(?=' + SIGIL_DELIMITERS + ')',
          contains: SIGIL_DELIMITER_MODES.map(x => hljs.inherit(x,
            {
              end: regex.concat(x.end, /[uismxfU]{0,7}/),
              contains: [ escapeSigilEnd(x.end) ]
            })
          )
        }
      ]
    };

    const STRING = {
      className: 'string',
      contains: [
        hljs.BACKSLASH_ESCAPE,
        SUBST
      ],
      variants: [
        {
          begin: /"""/,
          end: /"""/
        },
        {
          begin: /'''/,
          end: /'''/
        },
        {
          begin: /~S"""/,
          end: /"""/,
          contains: [] // override default
        },
        {
          begin: /~S"/,
          end: /"/,
          contains: [] // override default
        },
        {
          begin: /~S'''/,
          end: /'''/,
          contains: [] // override default
        },
        {
          begin: /~S'/,
          end: /'/,
          contains: [] // override default
        },
        {
          begin: /'/,
          end: /'/
        },
        {
          begin: /"/,
          end: /"/
        }
      ]
    };
    const FUNCTION = {
      className: 'function',
      beginKeywords: 'def defp defmacro defmacrop',
      end: /\B\b/, // the mode is ended by the title
      contains: [
        hljs.inherit(hljs.TITLE_MODE, {
          begin: ELIXIR_IDENT_RE,
          endsParent: true
        })
      ]
    };
    const CLASS = hljs.inherit(FUNCTION, {
      className: 'class',
      beginKeywords: 'defimpl defmodule defprotocol defrecord',
      end: /\bdo\b|$|;/
    });
    const ELIXIR_DEFAULT_CONTAINS = [
      STRING,
      REGEX_SIGIL,
      UPCASE_SIGIL,
      LOWERCASE_SIGIL,
      hljs.HASH_COMMENT_MODE,
      CLASS,
      FUNCTION,
      { begin: '::' },
      {
        className: 'symbol',
        begin: ':(?![\\s:])',
        contains: [
          STRING,
          { begin: ELIXIR_METHOD_RE }
        ],
        relevance: 0
      },
      {
        className: 'symbol',
        begin: ELIXIR_IDENT_RE + ':(?!:)',
        relevance: 0
      },
      { // Usage of a module, struct, etc.
        className: 'title.class',
        begin: /(\b[A-Z][a-zA-Z0-9_]+)/,
        relevance: 0
      },
      NUMBER,
      {
        className: 'variable',
        begin: '(\\$\\W)|((\\$|@@?)(\\w+))'
      }
      // -> has been removed, capnproto always uses this grammar construct
    ];
    SUBST.contains = ELIXIR_DEFAULT_CONTAINS;

    return {
      name: 'Elixir',
      aliases: [
        'ex',
        'exs'
      ],
      keywords: KWS,
      contains: ELIXIR_DEFAULT_CONTAINS
    };
  }

  return elixir;

})();

    hljs.registerLanguage('elixir', hljsGrammar);
  })();/*! `erlang` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Erlang
  Description: Erlang is a general-purpose functional language, with strict evaluation, single assignment, and dynamic typing.
  Author: Nikolay Zakharov <nikolay.desh@gmail.com>, Dmitry Kovega <arhibot@gmail.com>
  Website: https://www.erlang.org
  Category: functional
  */

  /** @type LanguageFn */
  function erlang(hljs) {
    const BASIC_ATOM_RE = '[a-z\'][a-zA-Z0-9_\']*';
    const FUNCTION_NAME_RE = '(' + BASIC_ATOM_RE + ':' + BASIC_ATOM_RE + '|' + BASIC_ATOM_RE + ')';
    const ERLANG_RESERVED = {
      keyword:
        'after and andalso|10 band begin bnot bor bsl bzr bxor case catch cond div end fun if '
        + 'let not of orelse|10 query receive rem try when xor maybe else',
      literal:
        'false true'
    };

    const COMMENT = hljs.COMMENT('%', '$');
    const NUMBER = {
      className: 'number',
      begin: '\\b(\\d+(_\\d+)*#[a-fA-F0-9]+(_[a-fA-F0-9]+)*|\\d+(_\\d+)*(\\.\\d+(_\\d+)*)?([eE][-+]?\\d+)?)',
      relevance: 0
    };
    const NAMED_FUN = { begin: 'fun\\s+' + BASIC_ATOM_RE + '/\\d+' };
    const FUNCTION_CALL = {
      begin: FUNCTION_NAME_RE + '\\(',
      end: '\\)',
      returnBegin: true,
      relevance: 0,
      contains: [
        {
          begin: FUNCTION_NAME_RE,
          relevance: 0
        },
        {
          begin: '\\(',
          end: '\\)',
          endsWithParent: true,
          returnEnd: true,
          relevance: 0
          // "contains" defined later
        }
      ]
    };
    const TUPLE = {
      begin: /\{/,
      end: /\}/,
      relevance: 0
      // "contains" defined later
    };
    const VAR1 = {
      begin: '\\b_([A-Z][A-Za-z0-9_]*)?',
      relevance: 0
    };
    const VAR2 = {
      begin: '[A-Z][a-zA-Z0-9_]*',
      relevance: 0
    };
    const RECORD_ACCESS = {
      begin: '#' + hljs.UNDERSCORE_IDENT_RE,
      relevance: 0,
      returnBegin: true,
      contains: [
        {
          begin: '#' + hljs.UNDERSCORE_IDENT_RE,
          relevance: 0
        },
        {
          begin: /\{/,
          end: /\}/,
          relevance: 0
          // "contains" defined later
        }
      ]
    };
    const CHAR_LITERAL = {
      scope: 'string',
      match: /\$(\\([^0-9]|[0-9]{1,3}|)|.)/,
    };
    const TRIPLE_QUOTE = {
      scope: 'string',
      match: /"""("*)(?!")[\s\S]*?"""\1/,
    };

    const SIGIL = {
      scope: 'string',
      contains: [ hljs.BACKSLASH_ESCAPE ],
      variants: [
        {match: /~\w?"""("*)(?!")[\s\S]*?"""\1/},
        {begin: /~\w?\(/, end: /\)/},
        {begin: /~\w?\[/, end: /\]/},
        {begin: /~\w?{/, end: /}/},
        {begin: /~\w?</, end: />/},
        {begin: /~\w?\//, end: /\//},
        {begin: /~\w?\|/, end: /\|/},
        {begin: /~\w?'/, end: /'/},
        {begin: /~\w?"/, end: /"/},
        {begin: /~\w?`/, end: /`/},
        {begin: /~\w?#/, end: /#/},
      ],
    };

    const BLOCK_STATEMENTS = {
      beginKeywords: 'fun receive if try case maybe',
      end: 'end',
      keywords: ERLANG_RESERVED
    };
    BLOCK_STATEMENTS.contains = [
      COMMENT,
      NAMED_FUN,
      hljs.inherit(hljs.APOS_STRING_MODE, { className: '' }),
      BLOCK_STATEMENTS,
      FUNCTION_CALL,
      SIGIL,
      TRIPLE_QUOTE,
      hljs.QUOTE_STRING_MODE,
      NUMBER,
      TUPLE,
      VAR1,
      VAR2,
      RECORD_ACCESS,
      CHAR_LITERAL
    ];

    const BASIC_MODES = [
      COMMENT,
      NAMED_FUN,
      BLOCK_STATEMENTS,
      FUNCTION_CALL,
      SIGIL,
      TRIPLE_QUOTE,
      hljs.QUOTE_STRING_MODE,
      NUMBER,
      TUPLE,
      VAR1,
      VAR2,
      RECORD_ACCESS,
      CHAR_LITERAL
    ];
    FUNCTION_CALL.contains[1].contains = BASIC_MODES;
    TUPLE.contains = BASIC_MODES;
    RECORD_ACCESS.contains[1].contains = BASIC_MODES;

    const DIRECTIVES = [
      "-module",
      "-record",
      "-undef",
      "-export",
      "-ifdef",
      "-ifndef",
      "-author",
      "-copyright",
      "-doc",
      "-moduledoc",
      "-vsn",
      "-import",
      "-include",
      "-include_lib",
      "-compile",
      "-define",
      "-else",
      "-endif",
      "-file",
      "-behaviour",
      "-behavior",
      "-spec",
      "-on_load",
      "-nifs",
    ];

    const PARAMS = {
      className: 'params',
      begin: '\\(',
      end: '\\)',
      contains: BASIC_MODES
    };

    return {
      name: 'Erlang',
      aliases: [ 'erl' ],
      keywords: ERLANG_RESERVED,
      illegal: '(</|\\*=|\\+=|-=|/\\*|\\*/|\\(\\*|\\*\\))',
      contains: [
        {
          className: 'function',
          begin: '^' + BASIC_ATOM_RE + '\\s*\\(',
          end: '->',
          returnBegin: true,
          illegal: '\\(|#|//|/\\*|\\\\|:|;',
          contains: [
            PARAMS,
            hljs.inherit(hljs.TITLE_MODE, { begin: BASIC_ATOM_RE })
          ],
          starts: {
            end: ';|\\.',
            keywords: ERLANG_RESERVED,
            contains: BASIC_MODES
          }
        },
        COMMENT,
        {
          begin: '^-',
          end: '\\.',
          relevance: 0,
          excludeEnd: true,
          returnBegin: true,
          keywords: {
            $pattern: '-' + hljs.IDENT_RE,
            keyword: DIRECTIVES.map(x => `${x}|1.5`).join(" ")
          },
          contains: [
            PARAMS,
            SIGIL,
            TRIPLE_QUOTE,
            hljs.QUOTE_STRING_MODE
          ]
        },
        NUMBER,
        SIGIL,
        TRIPLE_QUOTE,
        hljs.QUOTE_STRING_MODE,
        RECORD_ACCESS,
        VAR1,
        VAR2,
        TUPLE,
        CHAR_LITERAL,
        { begin: /\.$/ } // relevance booster
      ]
    };
  }

  return erlang;

})();

    hljs.registerLanguage('erlang', hljsGrammar);
  })();/*! `glsl` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: GLSL
  Description: OpenGL Shading Language
  Author: Sergey Tikhomirov <sergey@tikhomirov.io>
  Website: https://en.wikipedia.org/wiki/OpenGL_Shading_Language
  Category: graphics
  */

  function glsl(hljs) {
    return {
      name: 'GLSL',
      keywords: {
        keyword:
          // Statements
          'break continue discard do else for if return while switch case default '
          // Qualifiers
          + 'attribute binding buffer ccw centroid centroid varying coherent column_major const cw '
          + 'depth_any depth_greater depth_less depth_unchanged early_fragment_tests equal_spacing '
          + 'flat fractional_even_spacing fractional_odd_spacing highp in index inout invariant '
          + 'invocations isolines layout line_strip lines lines_adjacency local_size_x local_size_y '
          + 'local_size_z location lowp max_vertices mediump noperspective offset origin_upper_left '
          + 'out packed patch pixel_center_integer point_mode points precise precision quads r11f_g11f_b10f '
          + 'r16 r16_snorm r16f r16i r16ui r32f r32i r32ui r8 r8_snorm r8i r8ui readonly restrict '
          + 'rg16 rg16_snorm rg16f rg16i rg16ui rg32f rg32i rg32ui rg8 rg8_snorm rg8i rg8ui rgb10_a2 '
          + 'rgb10_a2ui rgba16 rgba16_snorm rgba16f rgba16i rgba16ui rgba32f rgba32i rgba32ui rgba8 '
          + 'rgba8_snorm rgba8i rgba8ui row_major sample shared smooth std140 std430 stream triangle_strip '
          + 'triangles triangles_adjacency uniform varying vertices volatile writeonly',
        type:
          'atomic_uint bool bvec2 bvec3 bvec4 dmat2 dmat2x2 dmat2x3 dmat2x4 dmat3 dmat3x2 dmat3x3 '
          + 'dmat3x4 dmat4 dmat4x2 dmat4x3 dmat4x4 double dvec2 dvec3 dvec4 float iimage1D iimage1DArray '
          + 'iimage2D iimage2DArray iimage2DMS iimage2DMSArray iimage2DRect iimage3D iimageBuffer '
          + 'iimageCube iimageCubeArray image1D image1DArray image2D image2DArray image2DMS image2DMSArray '
          + 'image2DRect image3D imageBuffer imageCube imageCubeArray int isampler1D isampler1DArray '
          + 'isampler2D isampler2DArray isampler2DMS isampler2DMSArray isampler2DRect isampler3D '
          + 'isamplerBuffer isamplerCube isamplerCubeArray ivec2 ivec3 ivec4 mat2 mat2x2 mat2x3 '
          + 'mat2x4 mat3 mat3x2 mat3x3 mat3x4 mat4 mat4x2 mat4x3 mat4x4 sampler1D sampler1DArray '
          + 'sampler1DArrayShadow sampler1DShadow sampler2D sampler2DArray sampler2DArrayShadow '
          + 'sampler2DMS sampler2DMSArray sampler2DRect sampler2DRectShadow sampler2DShadow sampler3D '
          + 'samplerBuffer samplerCube samplerCubeArray samplerCubeArrayShadow samplerCubeShadow '
          + 'image1D uimage1DArray uimage2D uimage2DArray uimage2DMS uimage2DMSArray uimage2DRect '
          + 'uimage3D uimageBuffer uimageCube uimageCubeArray uint usampler1D usampler1DArray '
          + 'usampler2D usampler2DArray usampler2DMS usampler2DMSArray usampler2DRect usampler3D '
          + 'samplerBuffer usamplerCube usamplerCubeArray uvec2 uvec3 uvec4 vec2 vec3 vec4 void',
        built_in:
          // Constants
          'gl_MaxAtomicCounterBindings gl_MaxAtomicCounterBufferSize gl_MaxClipDistances gl_MaxClipPlanes '
          + 'gl_MaxCombinedAtomicCounterBuffers gl_MaxCombinedAtomicCounters gl_MaxCombinedImageUniforms '
          + 'gl_MaxCombinedImageUnitsAndFragmentOutputs gl_MaxCombinedTextureImageUnits gl_MaxComputeAtomicCounterBuffers '
          + 'gl_MaxComputeAtomicCounters gl_MaxComputeImageUniforms gl_MaxComputeTextureImageUnits '
          + 'gl_MaxComputeUniformComponents gl_MaxComputeWorkGroupCount gl_MaxComputeWorkGroupSize '
          + 'gl_MaxDrawBuffers gl_MaxFragmentAtomicCounterBuffers gl_MaxFragmentAtomicCounters '
          + 'gl_MaxFragmentImageUniforms gl_MaxFragmentInputComponents gl_MaxFragmentInputVectors '
          + 'gl_MaxFragmentUniformComponents gl_MaxFragmentUniformVectors gl_MaxGeometryAtomicCounterBuffers '
          + 'gl_MaxGeometryAtomicCounters gl_MaxGeometryImageUniforms gl_MaxGeometryInputComponents '
          + 'gl_MaxGeometryOutputComponents gl_MaxGeometryOutputVertices gl_MaxGeometryTextureImageUnits '
          + 'gl_MaxGeometryTotalOutputComponents gl_MaxGeometryUniformComponents gl_MaxGeometryVaryingComponents '
          + 'gl_MaxImageSamples gl_MaxImageUnits gl_MaxLights gl_MaxPatchVertices gl_MaxProgramTexelOffset '
          + 'gl_MaxTessControlAtomicCounterBuffers gl_MaxTessControlAtomicCounters gl_MaxTessControlImageUniforms '
          + 'gl_MaxTessControlInputComponents gl_MaxTessControlOutputComponents gl_MaxTessControlTextureImageUnits '
          + 'gl_MaxTessControlTotalOutputComponents gl_MaxTessControlUniformComponents '
          + 'gl_MaxTessEvaluationAtomicCounterBuffers gl_MaxTessEvaluationAtomicCounters '
          + 'gl_MaxTessEvaluationImageUniforms gl_MaxTessEvaluationInputComponents gl_MaxTessEvaluationOutputComponents '
          + 'gl_MaxTessEvaluationTextureImageUnits gl_MaxTessEvaluationUniformComponents '
          + 'gl_MaxTessGenLevel gl_MaxTessPatchComponents gl_MaxTextureCoords gl_MaxTextureImageUnits '
          + 'gl_MaxTextureUnits gl_MaxVaryingComponents gl_MaxVaryingFloats gl_MaxVaryingVectors '
          + 'gl_MaxVertexAtomicCounterBuffers gl_MaxVertexAtomicCounters gl_MaxVertexAttribs gl_MaxVertexImageUniforms '
          + 'gl_MaxVertexOutputComponents gl_MaxVertexOutputVectors gl_MaxVertexTextureImageUnits '
          + 'gl_MaxVertexUniformComponents gl_MaxVertexUniformVectors gl_MaxViewports gl_MinProgramTexelOffset '
          // Variables
          + 'gl_BackColor gl_BackLightModelProduct gl_BackLightProduct gl_BackMaterial '
          + 'gl_BackSecondaryColor gl_ClipDistance gl_ClipPlane gl_ClipVertex gl_Color '
          + 'gl_DepthRange gl_EyePlaneQ gl_EyePlaneR gl_EyePlaneS gl_EyePlaneT gl_Fog gl_FogCoord '
          + 'gl_FogFragCoord gl_FragColor gl_FragCoord gl_FragData gl_FragDepth gl_FrontColor '
          + 'gl_FrontFacing gl_FrontLightModelProduct gl_FrontLightProduct gl_FrontMaterial '
          + 'gl_FrontSecondaryColor gl_GlobalInvocationID gl_InstanceID gl_InvocationID gl_Layer gl_LightModel '
          + 'gl_LightSource gl_LocalInvocationID gl_LocalInvocationIndex gl_ModelViewMatrix '
          + 'gl_ModelViewMatrixInverse gl_ModelViewMatrixInverseTranspose gl_ModelViewMatrixTranspose '
          + 'gl_ModelViewProjectionMatrix gl_ModelViewProjectionMatrixInverse gl_ModelViewProjectionMatrixInverseTranspose '
          + 'gl_ModelViewProjectionMatrixTranspose gl_MultiTexCoord0 gl_MultiTexCoord1 gl_MultiTexCoord2 '
          + 'gl_MultiTexCoord3 gl_MultiTexCoord4 gl_MultiTexCoord5 gl_MultiTexCoord6 gl_MultiTexCoord7 '
          + 'gl_Normal gl_NormalMatrix gl_NormalScale gl_NumSamples gl_NumWorkGroups gl_ObjectPlaneQ '
          + 'gl_ObjectPlaneR gl_ObjectPlaneS gl_ObjectPlaneT gl_PatchVerticesIn gl_Point gl_PointCoord '
          + 'gl_PointSize gl_Position gl_PrimitiveID gl_PrimitiveIDIn gl_ProjectionMatrix gl_ProjectionMatrixInverse '
          + 'gl_ProjectionMatrixInverseTranspose gl_ProjectionMatrixTranspose gl_SampleID gl_SampleMask '
          + 'gl_SampleMaskIn gl_SamplePosition gl_SecondaryColor gl_TessCoord gl_TessLevelInner gl_TessLevelOuter '
          + 'gl_TexCoord gl_TextureEnvColor gl_TextureMatrix gl_TextureMatrixInverse gl_TextureMatrixInverseTranspose '
          + 'gl_TextureMatrixTranspose gl_Vertex gl_VertexID gl_ViewportIndex gl_WorkGroupID gl_WorkGroupSize gl_in gl_out '
          // Functions
          + 'EmitStreamVertex EmitVertex EndPrimitive EndStreamPrimitive abs acos acosh all any asin '
          + 'asinh atan atanh atomicAdd atomicAnd atomicCompSwap atomicCounter atomicCounterDecrement '
          + 'atomicCounterIncrement atomicExchange atomicMax atomicMin atomicOr atomicXor barrier '
          + 'bitCount bitfieldExtract bitfieldInsert bitfieldReverse ceil clamp cos cosh cross '
          + 'dFdx dFdy degrees determinant distance dot equal exp exp2 faceforward findLSB findMSB '
          + 'floatBitsToInt floatBitsToUint floor fma fract frexp ftransform fwidth greaterThan '
          + 'greaterThanEqual groupMemoryBarrier imageAtomicAdd imageAtomicAnd imageAtomicCompSwap '
          + 'imageAtomicExchange imageAtomicMax imageAtomicMin imageAtomicOr imageAtomicXor imageLoad '
          + 'imageSize imageStore imulExtended intBitsToFloat interpolateAtCentroid interpolateAtOffset '
          + 'interpolateAtSample inverse inversesqrt isinf isnan ldexp length lessThan lessThanEqual log '
          + 'log2 matrixCompMult max memoryBarrier memoryBarrierAtomicCounter memoryBarrierBuffer '
          + 'memoryBarrierImage memoryBarrierShared min mix mod modf noise1 noise2 noise3 noise4 '
          + 'normalize not notEqual outerProduct packDouble2x32 packHalf2x16 packSnorm2x16 packSnorm4x8 '
          + 'packUnorm2x16 packUnorm4x8 pow radians reflect refract round roundEven shadow1D shadow1DLod '
          + 'shadow1DProj shadow1DProjLod shadow2D shadow2DLod shadow2DProj shadow2DProjLod sign sin sinh '
          + 'smoothstep sqrt step tan tanh texelFetch texelFetchOffset texture texture1D texture1DLod '
          + 'texture1DProj texture1DProjLod texture2D texture2DLod texture2DProj texture2DProjLod '
          + 'texture3D texture3DLod texture3DProj texture3DProjLod textureCube textureCubeLod '
          + 'textureGather textureGatherOffset textureGatherOffsets textureGrad textureGradOffset '
          + 'textureLod textureLodOffset textureOffset textureProj textureProjGrad textureProjGradOffset '
          + 'textureProjLod textureProjLodOffset textureProjOffset textureQueryLevels textureQueryLod '
          + 'textureSize transpose trunc uaddCarry uintBitsToFloat umulExtended unpackDouble2x32 '
          + 'unpackHalf2x16 unpackSnorm2x16 unpackSnorm4x8 unpackUnorm2x16 unpackUnorm4x8 usubBorrow',
        literal: 'true false'
      },
      illegal: '"',
      contains: [
        hljs.C_LINE_COMMENT_MODE,
        hljs.C_BLOCK_COMMENT_MODE,
        hljs.C_NUMBER_MODE,
        {
          className: 'meta',
          begin: '#',
          end: '$'
        }
      ]
    };
  }

  return glsl;

})();

    hljs.registerLanguage('glsl', hljsGrammar);
  })();/*! `go` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Go
  Author: Stephan Kountso aka StepLg <steplg@gmail.com>
  Contributors: Evgeny Stepanischev <imbolk@gmail.com>
  Description: Google go language (golang). For info about language
  Website: http://golang.org/
  Category: common, system
  */

  function go(hljs) {
    const LITERALS = [
      "true",
      "false",
      "iota",
      "nil"
    ];
    const BUILT_INS = [
      "append",
      "cap",
      "close",
      "complex",
      "copy",
      "imag",
      "len",
      "make",
      "new",
      "panic",
      "print",
      "println",
      "real",
      "recover",
      "delete"
    ];
    const TYPES = [
      "bool",
      "byte",
      "complex64",
      "complex128",
      "error",
      "float32",
      "float64",
      "int8",
      "int16",
      "int32",
      "int64",
      "string",
      "uint8",
      "uint16",
      "uint32",
      "uint64",
      "int",
      "uint",
      "uintptr",
      "rune"
    ];
    const KWS = [
      "break",
      "case",
      "chan",
      "const",
      "continue",
      "default",
      "defer",
      "else",
      "fallthrough",
      "for",
      "func",
      "go",
      "goto",
      "if",
      "import",
      "interface",
      "map",
      "package",
      "range",
      "return",
      "select",
      "struct",
      "switch",
      "type",
      "var",
    ];
    const KEYWORDS = {
      keyword: KWS,
      type: TYPES,
      literal: LITERALS,
      built_in: BUILT_INS
    };
    return {
      name: 'Go',
      aliases: [ 'golang' ],
      keywords: KEYWORDS,
      illegal: '</',
      contains: [
        hljs.C_LINE_COMMENT_MODE,
        hljs.C_BLOCK_COMMENT_MODE,
        {
          className: 'string',
          variants: [
            hljs.QUOTE_STRING_MODE,
            hljs.APOS_STRING_MODE,
            {
              begin: '`',
              end: '`'
            }
          ]
        },
        {
          className: 'number',
          variants: [
            {
              match: /-?\b0[xX]\.[a-fA-F0-9](_?[a-fA-F0-9])*[pP][+-]?\d(_?\d)*i?/, // hex without a present digit before . (making a digit afterwards required)
              relevance: 0
            },
            {
              match: /-?\b0[xX](_?[a-fA-F0-9])+((\.([a-fA-F0-9](_?[a-fA-F0-9])*)?)?[pP][+-]?\d(_?\d)*)?i?/, // hex with a present digit before . (making a digit afterwards optional)
              relevance: 0
            },
            {
              match: /-?\b0[oO](_?[0-7])*i?/, // leading 0o octal
              relevance: 0
            },
            {
              match: /-?\.\d(_?\d)*([eE][+-]?\d(_?\d)*)?i?/, // decimal without a present digit before . (making a digit afterwards required)
              relevance: 0
            },
            {
              match: /-?\b\d(_?\d)*(\.(\d(_?\d)*)?)?([eE][+-]?\d(_?\d)*)?i?/, // decimal with a present digit before . (making a digit afterwards optional)
              relevance: 0
            }
          ]
        },
        { begin: /:=/ // relevance booster
        },
        {
          className: 'function',
          beginKeywords: 'func',
          end: '\\s*(\\{|$)',
          excludeEnd: true,
          contains: [
            hljs.TITLE_MODE,
            {
              className: 'params',
              begin: /\(/,
              end: /\)/,
              endsParent: true,
              keywords: KEYWORDS,
              illegal: /["']/
            }
          ]
        }
      ]
    };
  }

  return go;

})();

    hljs.registerLanguage('go', hljsGrammar);
  })();/*! `gradle` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Gradle
  Description: Gradle is an open-source build automation tool focused on flexibility and performance.
  Website: https://gradle.org
  Author: Damian Mee <mee.damian@gmail.com>
  Category: build-system
  */

  function gradle(hljs) {
    const KEYWORDS = [
      "task",
      "project",
      "allprojects",
      "subprojects",
      "artifacts",
      "buildscript",
      "configurations",
      "dependencies",
      "repositories",
      "sourceSets",
      "description",
      "delete",
      "from",
      "into",
      "include",
      "exclude",
      "source",
      "classpath",
      "destinationDir",
      "includes",
      "options",
      "sourceCompatibility",
      "targetCompatibility",
      "group",
      "flatDir",
      "doLast",
      "doFirst",
      "flatten",
      "todir",
      "fromdir",
      "ant",
      "def",
      "abstract",
      "break",
      "case",
      "catch",
      "continue",
      "default",
      "do",
      "else",
      "extends",
      "final",
      "finally",
      "for",
      "if",
      "implements",
      "instanceof",
      "native",
      "new",
      "private",
      "protected",
      "public",
      "return",
      "static",
      "switch",
      "synchronized",
      "throw",
      "throws",
      "transient",
      "try",
      "volatile",
      "while",
      "strictfp",
      "package",
      "import",
      "false",
      "null",
      "super",
      "this",
      "true",
      "antlrtask",
      "checkstyle",
      "codenarc",
      "copy",
      "boolean",
      "byte",
      "char",
      "class",
      "double",
      "float",
      "int",
      "interface",
      "long",
      "short",
      "void",
      "compile",
      "runTime",
      "file",
      "fileTree",
      "abs",
      "any",
      "append",
      "asList",
      "asWritable",
      "call",
      "collect",
      "compareTo",
      "count",
      "div",
      "dump",
      "each",
      "eachByte",
      "eachFile",
      "eachLine",
      "every",
      "find",
      "findAll",
      "flatten",
      "getAt",
      "getErr",
      "getIn",
      "getOut",
      "getText",
      "grep",
      "immutable",
      "inject",
      "inspect",
      "intersect",
      "invokeMethods",
      "isCase",
      "join",
      "leftShift",
      "minus",
      "multiply",
      "newInputStream",
      "newOutputStream",
      "newPrintWriter",
      "newReader",
      "newWriter",
      "next",
      "plus",
      "pop",
      "power",
      "previous",
      "print",
      "println",
      "push",
      "putAt",
      "read",
      "readBytes",
      "readLines",
      "reverse",
      "reverseEach",
      "round",
      "size",
      "sort",
      "splitEachLine",
      "step",
      "subMap",
      "times",
      "toInteger",
      "toList",
      "tokenize",
      "upto",
      "waitForOrKill",
      "withPrintWriter",
      "withReader",
      "withStream",
      "withWriter",
      "withWriterAppend",
      "write",
      "writeLine"
    ];
    return {
      name: 'Gradle',
      case_insensitive: true,
      keywords: KEYWORDS,
      contains: [
        hljs.C_LINE_COMMENT_MODE,
        hljs.C_BLOCK_COMMENT_MODE,
        hljs.APOS_STRING_MODE,
        hljs.QUOTE_STRING_MODE,
        hljs.NUMBER_MODE,
        hljs.REGEXP_MODE

      ]
    };
  }

  return gradle;

})();

    hljs.registerLanguage('gradle', hljsGrammar);
  })();/*! `graphql` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
   Language: GraphQL
   Author: John Foster (GH jf990), and others
   Description: GraphQL is a query language for APIs
   Category: web, common
  */

  /** @type LanguageFn */
  function graphql(hljs) {
    const regex = hljs.regex;
    const GQL_NAME = /[_A-Za-z][_0-9A-Za-z]*/;
    return {
      name: "GraphQL",
      aliases: [ "gql" ],
      case_insensitive: true,
      disableAutodetect: false,
      keywords: {
        keyword: [
          "query",
          "mutation",
          "subscription",
          "type",
          "input",
          "schema",
          "directive",
          "interface",
          "union",
          "scalar",
          "fragment",
          "enum",
          "on"
        ],
        literal: [
          "true",
          "false",
          "null"
        ]
      },
      contains: [
        hljs.HASH_COMMENT_MODE,
        hljs.QUOTE_STRING_MODE,
        hljs.NUMBER_MODE,
        {
          scope: "punctuation",
          match: /[.]{3}/,
          relevance: 0
        },
        {
          scope: "punctuation",
          begin: /[\!\(\)\:\=\[\]\{\|\}]{1}/,
          relevance: 0
        },
        {
          scope: "variable",
          begin: /\$/,
          end: /\W/,
          excludeEnd: true,
          relevance: 0
        },
        {
          scope: "meta",
          match: /@\w+/,
          excludeEnd: true
        },
        {
          scope: "symbol",
          begin: regex.concat(GQL_NAME, regex.lookahead(/\s*:/)),
          relevance: 0
        }
      ],
      illegal: [
        /[;<']/,
        /BEGIN/
      ]
    };
  }

  return graphql;

})();

    hljs.registerLanguage('graphql', hljsGrammar);
  })();/*! `groovy` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
   Language: Groovy
   Author: Guillaume Laforge <glaforge@gmail.com>
   Description: Groovy programming language implementation inspired from Vsevolod's Java mode
   Website: https://groovy-lang.org
   Category: system
   */

  function variants(variants, obj = {}) {
    obj.variants = variants;
    return obj;
  }

  function groovy(hljs) {
    const regex = hljs.regex;
    const IDENT_RE = '[A-Za-z0-9_$]+';
    const COMMENT = variants([
      hljs.C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      hljs.COMMENT(
        '/\\*\\*',
        '\\*/',
        {
          relevance: 0,
          contains: [
            {
              // eat up @'s in emails to prevent them to be recognized as doctags
              begin: /\w+@/,
              relevance: 0
            },
            {
              className: 'doctag',
              begin: '@[A-Za-z]+'
            }
          ]
        }
      )
    ]);
    const REGEXP = {
      className: 'regexp',
      begin: /~?\/[^\/\n]+\//,
      contains: [ hljs.BACKSLASH_ESCAPE ]
    };
    const NUMBER = variants([
      hljs.BINARY_NUMBER_MODE,
      hljs.C_NUMBER_MODE
    ]);
    const STRING = variants([
      {
        begin: /"""/,
        end: /"""/
      },
      {
        begin: /'''/,
        end: /'''/
      },
      {
        begin: "\\$/",
        end: "/\\$",
        relevance: 10
      },
      hljs.APOS_STRING_MODE,
      hljs.QUOTE_STRING_MODE
    ],
    { className: "string" }
    );

    const CLASS_DEFINITION = {
      match: [
        /(class|interface|trait|enum|record|extends|implements)/,
        /\s+/,
        hljs.UNDERSCORE_IDENT_RE
      ],
      scope: {
        1: "keyword",
        3: "title.class",
      }
    };
    const TYPES = [
      "byte",
      "short",
      "char",
      "int",
      "long",
      "boolean",
      "float",
      "double",
      "void"
    ];
    const KEYWORDS = [
      // groovy specific keywords
      "def",
      "as",
      "in",
      "assert",
      "trait",
      // common keywords with Java
      "abstract",
      "static",
      "volatile",
      "transient",
      "public",
      "private",
      "protected",
      "synchronized",
      "final",
      "class",
      "interface",
      "enum",
      "if",
      "else",
      "for",
      "while",
      "switch",
      "case",
      "break",
      "default",
      "continue",
      "throw",
      "throws",
      "try",
      "catch",
      "finally",
      "implements",
      "extends",
      "new",
      "import",
      "package",
      "return",
      "instanceof",
      "var"
    ];

    return {
      name: 'Groovy',
      keywords: {
        "variable.language": 'this super',
        literal: 'true false null',
        type: TYPES,
        keyword: KEYWORDS
      },
      contains: [
        hljs.SHEBANG({
          binary: "groovy",
          relevance: 10
        }),
        COMMENT,
        STRING,
        REGEXP,
        NUMBER,
        CLASS_DEFINITION,
        {
          className: 'meta',
          begin: '@[A-Za-z]+',
          relevance: 0
        },
        {
          // highlight map keys and named parameters as attrs
          className: 'attr',
          begin: IDENT_RE + '[ \t]*:',
          relevance: 0
        },
        {
          // catch middle element of the ternary operator
          // to avoid highlight it as a label, named parameter, or map key
          begin: /\?/,
          end: /:/,
          relevance: 0,
          contains: [
            COMMENT,
            STRING,
            REGEXP,
            NUMBER,
            'self'
          ]
        },
        {
          // highlight labeled statements
          className: 'symbol',
          begin: '^[ \t]*' + regex.lookahead(IDENT_RE + ':'),
          excludeBegin: true,
          end: IDENT_RE + ':',
          relevance: 0
        }
      ],
      illegal: /#|<\//
    };
  }

  return groovy;

})();

    hljs.registerLanguage('groovy', hljsGrammar);
  })();/*! `haskell` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Haskell
  Author: Jeremy Hull <sourdrums@gmail.com>
  Contributors: Zena Treep <zena.treep@gmail.com>
  Website: https://www.haskell.org
  Category: functional
  */

  function haskell(hljs) {

    /* See:
       - https://www.haskell.org/onlinereport/lexemes.html
       - https://downloads.haskell.org/ghc/9.0.1/docs/html/users_guide/exts/binary_literals.html
       - https://downloads.haskell.org/ghc/9.0.1/docs/html/users_guide/exts/numeric_underscores.html
       - https://downloads.haskell.org/ghc/9.0.1/docs/html/users_guide/exts/hex_float_literals.html
    */
    const decimalDigits = '([0-9]_*)+';
    const hexDigits = '([0-9a-fA-F]_*)+';
    const binaryDigits = '([01]_*)+';
    const octalDigits = '([0-7]_*)+';
    const ascSymbol = '[!#$%&*+.\\/<=>?@\\\\^~-]';
    const uniSymbol = '(\\p{S}|\\p{P})'; // Symbol or Punctuation
    const special = '[(),;\\[\\]`|{}]';
    const symbol = `(${ascSymbol}|(?!(${special}|[_:"']))${uniSymbol})`;

    const COMMENT = { variants: [
      // Double dash forms a valid comment only if it's not part of legal lexeme.
      // See: Haskell 98 report: https://www.haskell.org/onlinereport/lexemes.html
      //
      // The commented code does the job, but we can't use negative lookbehind,
      // due to poor support by Safari browser.
      // > hljs.COMMENT(`(?<!${symbol})--+(?!${symbol})`, '$'),
      // So instead, we'll add a no-markup rule before the COMMENT rule in the rules list
      // to match the problematic infix operators that contain double dash.
      hljs.COMMENT('--+', '$'),
      hljs.COMMENT(
        /\{-/,
        /-\}/,
        { contains: [ 'self' ] }
      )
    ] };

    const PRAGMA = {
      className: 'meta',
      begin: /\{-#/,
      end: /#-\}/
    };

    const PREPROCESSOR = {
      className: 'meta',
      begin: '^#',
      end: '$'
    };

    const CONSTRUCTOR = {
      className: 'type',
      begin: '\\b[A-Z][\\w\']*', // TODO: other constructors (build-in, infix).
      relevance: 0
    };

    const LIST = {
      begin: '\\(',
      end: '\\)',
      illegal: '"',
      contains: [
        PRAGMA,
        PREPROCESSOR,
        {
          className: 'type',
          begin: '\\b[A-Z][\\w]*(\\((\\.\\.|,|\\w+)\\))?'
        },
        hljs.inherit(hljs.TITLE_MODE, { begin: '[_a-z][\\w\']*' }),
        COMMENT
      ]
    };

    const RECORD = {
      begin: /\{/,
      end: /\}/,
      contains: LIST.contains
    };

    const NUMBER = {
      className: 'number',
      relevance: 0,
      variants: [
        // decimal floating-point-literal (subsumes decimal-literal)
        { match: `\\b(${decimalDigits})(\\.(${decimalDigits}))?` + `([eE][+-]?(${decimalDigits}))?\\b` },
        // hexadecimal floating-point-literal (subsumes hexadecimal-literal)
        { match: `\\b0[xX]_*(${hexDigits})(\\.(${hexDigits}))?` + `([pP][+-]?(${decimalDigits}))?\\b` },
        // octal-literal
        { match: `\\b0[oO](${octalDigits})\\b` },
        // binary-literal
        { match: `\\b0[bB](${binaryDigits})\\b` }
      ]
    };

    return {
      name: 'Haskell',
      aliases: [ 'hs' ],
      keywords:
        'let in if then else case of where do module import hiding '
        + 'qualified type data newtype deriving class instance as default '
        + 'infix infixl infixr foreign export ccall stdcall cplusplus '
        + 'jvm dotnet safe unsafe family forall mdo proc rec',
      unicodeRegex: true,
      contains: [
        // Top-level constructions.
        {
          beginKeywords: 'module',
          end: 'where',
          keywords: 'module where',
          contains: [
            LIST,
            COMMENT
          ],
          illegal: '\\W\\.|;'
        },
        {
          begin: '\\bimport\\b',
          end: '$',
          keywords: 'import qualified as hiding',
          contains: [
            LIST,
            COMMENT
          ],
          illegal: '\\W\\.|;'
        },
        {
          className: 'class',
          begin: '^(\\s*)?(class|instance)\\b',
          end: 'where',
          keywords: 'class family instance where',
          contains: [
            CONSTRUCTOR,
            LIST,
            COMMENT
          ]
        },
        {
          className: 'class',
          begin: '\\b(data|(new)?type)\\b',
          end: '$',
          keywords: 'data family type newtype deriving',
          contains: [
            PRAGMA,
            CONSTRUCTOR,
            LIST,
            RECORD,
            COMMENT
          ]
        },
        {
          beginKeywords: 'default',
          end: '$',
          contains: [
            CONSTRUCTOR,
            LIST,
            COMMENT
          ]
        },
        {
          beginKeywords: 'infix infixl infixr',
          end: '$',
          contains: [
            hljs.C_NUMBER_MODE,
            COMMENT
          ]
        },
        {
          begin: '\\bforeign\\b',
          end: '$',
          keywords: 'foreign import export ccall stdcall cplusplus jvm '
                    + 'dotnet safe unsafe',
          contains: [
            CONSTRUCTOR,
            hljs.QUOTE_STRING_MODE,
            COMMENT
          ]
        },
        {
          className: 'meta',
          begin: '#!\\/usr\\/bin\\/env\ runhaskell',
          end: '$'
        },
        // "Whitespaces".
        PRAGMA,
        PREPROCESSOR,

        // Literals and names.

        // Single characters.
        {
          scope: 'string',
          begin: /'(?=\\?.')/,
          end: /'/,
          contains: [
            {
              scope: 'char.escape',
              match: /\\./,
            },
          ]
        },
        hljs.QUOTE_STRING_MODE,
        NUMBER,
        CONSTRUCTOR,
        hljs.inherit(hljs.TITLE_MODE, { begin: '^[_a-z][\\w\']*' }),
        // No markup, prevents infix operators from being recognized as comments.
        { begin: `(?!-)${symbol}--+|--+(?!-)${symbol}`},
        COMMENT,
        { // No markup, relevance booster
          begin: '->|<-' }
      ]
    };
  }

  return haskell;

})();

    hljs.registerLanguage('haskell', hljsGrammar);
  })();/*! `http` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: HTTP
  Description: HTTP request and response headers with automatic body highlighting
  Author: Ivan Sagalaev <maniac@softwaremaniacs.org>
  Category: protocols, web
  Website: https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview
  */

  function http(hljs) {
    const regex = hljs.regex;
    const VERSION = 'HTTP/([32]|1\\.[01])';
    const HEADER_NAME = /[A-Za-z][A-Za-z0-9-]*/;
    const HEADER = {
      className: 'attribute',
      begin: regex.concat('^', HEADER_NAME, '(?=\\:\\s)'),
      starts: { contains: [
        {
          className: "punctuation",
          begin: /: /,
          relevance: 0,
          starts: {
            end: '$',
            relevance: 0
          }
        }
      ] }
    };
    const HEADERS_AND_BODY = [
      HEADER,
      {
        begin: '\\n\\n',
        starts: {
          subLanguage: [],
          endsWithParent: true
        }
      }
    ];

    return {
      name: 'HTTP',
      aliases: [ 'https' ],
      illegal: /\S/,
      contains: [
        // response
        {
          begin: '^(?=' + VERSION + " \\d{3})",
          end: /$/,
          contains: [
            {
              className: "meta",
              begin: VERSION
            },
            {
              className: 'number',
              begin: '\\b\\d{3}\\b'
            }
          ],
          starts: {
            end: /\b\B/,
            illegal: /\S/,
            contains: HEADERS_AND_BODY
          }
        },
        // request
        {
          begin: '(?=^[A-Z]+ (.*?) ' + VERSION + '$)',
          end: /$/,
          contains: [
            {
              className: 'string',
              begin: ' ',
              end: ' ',
              excludeBegin: true,
              excludeEnd: true
            },
            {
              className: "meta",
              begin: VERSION
            },
            {
              className: 'keyword',
              begin: '[A-Z]+'
            }
          ],
          starts: {
            end: /\b\B/,
            illegal: /\S/,
            contains: HEADERS_AND_BODY
          }
        },
        // to allow headers to work even without a preamble
        hljs.inherit(HEADER, { relevance: 0 })
      ]
    };
  }

  return http;

})();

    hljs.registerLanguage('http', hljsGrammar);
  })();/*! `ini` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: TOML, also INI
  Description: TOML aims to be a minimal configuration file format that's easy to read due to obvious semantics.
  Contributors: Guillaume Gomez <guillaume1.gomez@gmail.com>
  Category: common, config
  Website: https://github.com/toml-lang/toml
  */

  function ini(hljs) {
    const regex = hljs.regex;
    const NUMBERS = {
      className: 'number',
      relevance: 0,
      variants: [
        { begin: /([+-]+)?[\d]+_[\d_]+/ },
        { begin: hljs.NUMBER_RE }
      ]
    };
    const COMMENTS = hljs.COMMENT();
    COMMENTS.variants = [
      {
        begin: /;/,
        end: /$/
      },
      {
        begin: /#/,
        end: /$/
      }
    ];
    const VARIABLES = {
      className: 'variable',
      variants: [
        { begin: /\$[\w\d"][\w\d_]*/ },
        { begin: /\$\{(.*?)\}/ }
      ]
    };
    const LITERALS = {
      className: 'literal',
      begin: /\bon|off|true|false|yes|no\b/
    };
    const STRINGS = {
      className: "string",
      contains: [ hljs.BACKSLASH_ESCAPE ],
      variants: [
        {
          begin: "'''",
          end: "'''",
          relevance: 10
        },
        {
          begin: '"""',
          end: '"""',
          relevance: 10
        },
        {
          begin: '"',
          end: '"'
        },
        {
          begin: "'",
          end: "'"
        }
      ]
    };
    const ARRAY = {
      begin: /\[/,
      end: /\]/,
      contains: [
        COMMENTS,
        LITERALS,
        VARIABLES,
        STRINGS,
        NUMBERS,
        'self'
      ],
      relevance: 0
    };

    const BARE_KEY = /[A-Za-z0-9_-]+/;
    const QUOTED_KEY_DOUBLE_QUOTE = /"(\\"|[^"])*"/;
    const QUOTED_KEY_SINGLE_QUOTE = /'[^']*'/;
    const ANY_KEY = regex.either(
      BARE_KEY, QUOTED_KEY_DOUBLE_QUOTE, QUOTED_KEY_SINGLE_QUOTE
    );
    const DOTTED_KEY = regex.concat(
      ANY_KEY, '(\\s*\\.\\s*', ANY_KEY, ')*',
      regex.lookahead(/\s*=\s*[^#\s]/)
    );

    return {
      name: 'TOML, also INI',
      aliases: [ 'toml' ],
      case_insensitive: true,
      illegal: /\S/,
      contains: [
        COMMENTS,
        {
          className: 'section',
          begin: /\[+/,
          end: /\]+/
        },
        {
          begin: DOTTED_KEY,
          className: 'attr',
          starts: {
            end: /$/,
            contains: [
              COMMENTS,
              ARRAY,
              LITERALS,
              VARIABLES,
              STRINGS,
              NUMBERS
            ]
          }
        }
      ]
    };
  }

  return ini;

})();

    hljs.registerLanguage('ini', hljsGrammar);
  })();/*! `java` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  // https://docs.oracle.com/javase/specs/jls/se15/html/jls-3.html#jls-3.10
  var decimalDigits = '[0-9](_*[0-9])*';
  var frac = `\\.(${decimalDigits})`;
  var hexDigits = '[0-9a-fA-F](_*[0-9a-fA-F])*';
  var NUMERIC = {
    className: 'number',
    variants: [
      // DecimalFloatingPointLiteral
      // including ExponentPart
      { begin: `(\\b(${decimalDigits})((${frac})|\\.)?|(${frac}))` +
        `[eE][+-]?(${decimalDigits})[fFdD]?\\b` },
      // excluding ExponentPart
      { begin: `\\b(${decimalDigits})((${frac})[fFdD]?\\b|\\.([fFdD]\\b)?)` },
      { begin: `(${frac})[fFdD]?\\b` },
      { begin: `\\b(${decimalDigits})[fFdD]\\b` },

      // HexadecimalFloatingPointLiteral
      { begin: `\\b0[xX]((${hexDigits})\\.?|(${hexDigits})?\\.(${hexDigits}))` +
        `[pP][+-]?(${decimalDigits})[fFdD]?\\b` },

      // DecimalIntegerLiteral
      { begin: '\\b(0|[1-9](_*[0-9])*)[lL]?\\b' },

      // HexIntegerLiteral
      { begin: `\\b0[xX](${hexDigits})[lL]?\\b` },

      // OctalIntegerLiteral
      { begin: '\\b0(_*[0-7])*[lL]?\\b' },

      // BinaryIntegerLiteral
      { begin: '\\b0[bB][01](_*[01])*[lL]?\\b' },
    ],
    relevance: 0
  };

  /*
  Language: Java
  Author: Vsevolod Solovyov <vsevolod.solovyov@gmail.com>
  Category: common, enterprise
  Website: https://www.java.com/
  */


  /**
   * Allows recursive regex expressions to a given depth
   *
   * ie: recurRegex("(abc~~~)", /~~~/g, 2) becomes:
   * (abc(abc(abc)))
   *
   * @param {string} re
   * @param {RegExp} substitution (should be a g mode regex)
   * @param {number} depth
   * @returns {string}``
   */
  function recurRegex(re, substitution, depth) {
    if (depth === -1) return "";

    return re.replace(substitution, _ => {
      return recurRegex(re, substitution, depth - 1);
    });
  }

  /** @type LanguageFn */
  function java(hljs) {
    const regex = hljs.regex;
    const JAVA_IDENT_RE = '[\u00C0-\u02B8a-zA-Z_$][\u00C0-\u02B8a-zA-Z_$0-9]*';
    const GENERIC_IDENT_RE = JAVA_IDENT_RE
      + recurRegex('(?:<' + JAVA_IDENT_RE + '~~~(?:\\s*,\\s*' + JAVA_IDENT_RE + '~~~)*>)?', /~~~/g, 2);
    const MAIN_KEYWORDS = [
      'synchronized',
      'abstract',
      'private',
      'var',
      'static',
      'if',
      'const ',
      'for',
      'while',
      'strictfp',
      'finally',
      'protected',
      'import',
      'native',
      'final',
      'void',
      'enum',
      'else',
      'break',
      'transient',
      'catch',
      'instanceof',
      'volatile',
      'case',
      'assert',
      'package',
      'default',
      'public',
      'try',
      'switch',
      'continue',
      'throws',
      'protected',
      'public',
      'private',
      'module',
      'requires',
      'exports',
      'do',
      'sealed',
      'yield',
      'permits',
      'goto',
      'when'
    ];

    const BUILT_INS = [
      'super',
      'this'
    ];

    const LITERALS = [
      'false',
      'true',
      'null'
    ];

    const TYPES = [
      'char',
      'boolean',
      'long',
      'float',
      'int',
      'byte',
      'short',
      'double'
    ];

    const KEYWORDS = {
      keyword: MAIN_KEYWORDS,
      literal: LITERALS,
      type: TYPES,
      built_in: BUILT_INS
    };

    const ANNOTATION = {
      className: 'meta',
      begin: '@' + JAVA_IDENT_RE,
      contains: [
        {
          begin: /\(/,
          end: /\)/,
          contains: [ "self" ] // allow nested () inside our annotation
        }
      ]
    };
    const PARAMS = {
      className: 'params',
      begin: /\(/,
      end: /\)/,
      keywords: KEYWORDS,
      relevance: 0,
      contains: [ hljs.C_BLOCK_COMMENT_MODE ],
      endsParent: true
    };

    return {
      name: 'Java',
      aliases: [ 'jsp' ],
      keywords: KEYWORDS,
      illegal: /<\/|#/,
      contains: [
        hljs.COMMENT(
          '/\\*\\*',
          '\\*/',
          {
            relevance: 0,
            contains: [
              {
                // eat up @'s in emails to prevent them to be recognized as doctags
                begin: /\w+@/,
                relevance: 0
              },
              {
                className: 'doctag',
                begin: '@[A-Za-z]+'
              }
            ]
          }
        ),
        // relevance boost
        {
          begin: /import java\.[a-z]+\./,
          keywords: "import",
          relevance: 2
        },
        hljs.C_LINE_COMMENT_MODE,
        hljs.C_BLOCK_COMMENT_MODE,
        {
          begin: /"""/,
          end: /"""/,
          className: "string",
          contains: [ hljs.BACKSLASH_ESCAPE ]
        },
        hljs.APOS_STRING_MODE,
        hljs.QUOTE_STRING_MODE,
        {
          match: [
            /\b(?:class|interface|enum|extends|implements|new)/,
            /\s+/,
            JAVA_IDENT_RE
          ],
          className: {
            1: "keyword",
            3: "title.class"
          }
        },
        {
          // Exceptions for hyphenated keywords
          match: /non-sealed/,
          scope: "keyword"
        },
        {
          begin: [
            regex.concat(/(?!else)/, JAVA_IDENT_RE),
            /\s+/,
            JAVA_IDENT_RE,
            /\s+/,
            /=(?!=)/
          ],
          className: {
            1: "type",
            3: "variable",
            5: "operator"
          }
        },
        {
          begin: [
            /record/,
            /\s+/,
            JAVA_IDENT_RE
          ],
          className: {
            1: "keyword",
            3: "title.class"
          },
          contains: [
            PARAMS,
            hljs.C_LINE_COMMENT_MODE,
            hljs.C_BLOCK_COMMENT_MODE
          ]
        },
        {
          // Expression keywords prevent 'keyword Name(...)' from being
          // recognized as a function definition
          beginKeywords: 'new throw return else',
          relevance: 0
        },
        {
          begin: [
            '(?:' + GENERIC_IDENT_RE + '\\s+)',
            hljs.UNDERSCORE_IDENT_RE,
            /\s*(?=\()/
          ],
          className: { 2: "title.function" },
          keywords: KEYWORDS,
          contains: [
            {
              className: 'params',
              begin: /\(/,
              end: /\)/,
              keywords: KEYWORDS,
              relevance: 0,
              contains: [
                ANNOTATION,
                hljs.APOS_STRING_MODE,
                hljs.QUOTE_STRING_MODE,
                NUMERIC,
                hljs.C_BLOCK_COMMENT_MODE
              ]
            },
            hljs.C_LINE_COMMENT_MODE,
            hljs.C_BLOCK_COMMENT_MODE
          ]
        },
        NUMERIC,
        ANNOTATION
      ]
    };
  }

  return java;

})();

    hljs.registerLanguage('java', hljsGrammar);
  })();/*! `javascript` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  const IDENT_RE = '[A-Za-z$_][0-9A-Za-z$_]*';
  const KEYWORDS = [
    "as", // for exports
    "in",
    "of",
    "if",
    "for",
    "while",
    "finally",
    "var",
    "new",
    "function",
    "do",
    "return",
    "void",
    "else",
    "break",
    "catch",
    "instanceof",
    "with",
    "throw",
    "case",
    "default",
    "try",
    "switch",
    "continue",
    "typeof",
    "delete",
    "let",
    "yield",
    "const",
    "class",
    // JS handles these with a special rule
    // "get",
    // "set",
    "debugger",
    "async",
    "await",
    "static",
    "import",
    "from",
    "export",
    "extends",
    // It's reached stage 3, which is "recommended for implementation":
    "using"
  ];
  const LITERALS = [
    "true",
    "false",
    "null",
    "undefined",
    "NaN",
    "Infinity"
  ];

  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects
  const TYPES = [
    // Fundamental objects
    "Object",
    "Function",
    "Boolean",
    "Symbol",
    // numbers and dates
    "Math",
    "Date",
    "Number",
    "BigInt",
    // text
    "String",
    "RegExp",
    // Indexed collections
    "Array",
    "Float32Array",
    "Float64Array",
    "Int8Array",
    "Uint8Array",
    "Uint8ClampedArray",
    "Int16Array",
    "Int32Array",
    "Uint16Array",
    "Uint32Array",
    "BigInt64Array",
    "BigUint64Array",
    // Keyed collections
    "Set",
    "Map",
    "WeakSet",
    "WeakMap",
    // Structured data
    "ArrayBuffer",
    "SharedArrayBuffer",
    "Atomics",
    "DataView",
    "JSON",
    // Control abstraction objects
    "Promise",
    "Generator",
    "GeneratorFunction",
    "AsyncFunction",
    // Reflection
    "Reflect",
    "Proxy",
    // Internationalization
    "Intl",
    // WebAssembly
    "WebAssembly"
  ];

  const ERROR_TYPES = [
    "Error",
    "EvalError",
    "InternalError",
    "RangeError",
    "ReferenceError",
    "SyntaxError",
    "TypeError",
    "URIError"
  ];

  const BUILT_IN_GLOBALS = [
    "setInterval",
    "setTimeout",
    "clearInterval",
    "clearTimeout",

    "require",
    "exports",

    "eval",
    "isFinite",
    "isNaN",
    "parseFloat",
    "parseInt",
    "decodeURI",
    "decodeURIComponent",
    "encodeURI",
    "encodeURIComponent",
    "escape",
    "unescape"
  ];

  const BUILT_IN_VARIABLES = [
    "arguments",
    "this",
    "super",
    "console",
    "window",
    "document",
    "localStorage",
    "sessionStorage",
    "module",
    "global" // Node.js
  ];

  const BUILT_INS = [].concat(
    BUILT_IN_GLOBALS,
    TYPES,
    ERROR_TYPES
  );

  /*
  Language: JavaScript
  Description: JavaScript (JS) is a lightweight, interpreted, or just-in-time compiled programming language with first-class functions.
  Category: common, scripting, web
  Website: https://developer.mozilla.org/en-US/docs/Web/JavaScript
  */


  /** @type LanguageFn */
  function javascript(hljs) {
    const regex = hljs.regex;
    /**
     * Takes a string like "<Booger" and checks to see
     * if we can find a matching "</Booger" later in the
     * content.
     * @param {RegExpMatchArray} match
     * @param {{after:number}} param1
     */
    const hasClosingTag = (match, { after }) => {
      const tag = "</" + match[0].slice(1);
      const pos = match.input.indexOf(tag, after);
      return pos !== -1;
    };

    const IDENT_RE$1 = IDENT_RE;
    const FRAGMENT = {
      begin: '<>',
      end: '</>'
    };
    // to avoid some special cases inside isTrulyOpeningTag
    const XML_SELF_CLOSING = /<[A-Za-z0-9\\._:-]+\s*\/>/;
    const XML_TAG = {
      begin: /<[A-Za-z0-9\\._:-]+/,
      end: /\/[A-Za-z0-9\\._:-]+>|\/>/,
      /**
       * @param {RegExpMatchArray} match
       * @param {CallbackResponse} response
       */
      isTrulyOpeningTag: (match, response) => {
        const afterMatchIndex = match[0].length + match.index;
        const nextChar = match.input[afterMatchIndex];
        if (
          // HTML should not include another raw `<` inside a tag
          // nested type?
          // `<Array<Array<number>>`, etc.
          nextChar === "<" ||
          // the , gives away that this is not HTML
          // `<T, A extends keyof T, V>`
          nextChar === ","
          ) {
          response.ignoreMatch();
          return;
        }

        // `<something>`
        // Quite possibly a tag, lets look for a matching closing tag...
        if (nextChar === ">") {
          // if we cannot find a matching closing tag, then we
          // will ignore it
          if (!hasClosingTag(match, { after: afterMatchIndex })) {
            response.ignoreMatch();
          }
        }

        // `<blah />` (self-closing)
        // handled by simpleSelfClosing rule

        let m;
        const afterMatch = match.input.substring(afterMatchIndex);

        // some more template typing stuff
        //  <T = any>(key?: string) => Modify<
        if ((m = afterMatch.match(/^\s*=/))) {
          response.ignoreMatch();
          return;
        }

        // `<From extends string>`
        // technically this could be HTML, but it smells like a type
        // NOTE: This is ugh, but added specifically for https://github.com/highlightjs/highlight.js/issues/3276
        if ((m = afterMatch.match(/^\s+extends\s+/))) {
          if (m.index === 0) {
            response.ignoreMatch();
            // eslint-disable-next-line no-useless-return
            return;
          }
        }
      }
    };
    const KEYWORDS$1 = {
      $pattern: IDENT_RE,
      keyword: KEYWORDS,
      literal: LITERALS,
      built_in: BUILT_INS,
      "variable.language": BUILT_IN_VARIABLES
    };

    // https://tc39.es/ecma262/#sec-literals-numeric-literals
    const decimalDigits = '[0-9](_?[0-9])*';
    const frac = `\\.(${decimalDigits})`;
    // DecimalIntegerLiteral, including Annex B NonOctalDecimalIntegerLiteral
    // https://tc39.es/ecma262/#sec-additional-syntax-numeric-literals
    const decimalInteger = `0|[1-9](_?[0-9])*|0[0-7]*[89][0-9]*`;
    const NUMBER = {
      className: 'number',
      variants: [
        // DecimalLiteral
        { begin: `(\\b(${decimalInteger})((${frac})|\\.)?|(${frac}))` +
          `[eE][+-]?(${decimalDigits})\\b` },
        { begin: `\\b(${decimalInteger})\\b((${frac})\\b|\\.)?|(${frac})\\b` },

        // DecimalBigIntegerLiteral
        { begin: `\\b(0|[1-9](_?[0-9])*)n\\b` },

        // NonDecimalIntegerLiteral
        { begin: "\\b0[xX][0-9a-fA-F](_?[0-9a-fA-F])*n?\\b" },
        { begin: "\\b0[bB][0-1](_?[0-1])*n?\\b" },
        { begin: "\\b0[oO][0-7](_?[0-7])*n?\\b" },

        // LegacyOctalIntegerLiteral (does not include underscore separators)
        // https://tc39.es/ecma262/#sec-additional-syntax-numeric-literals
        { begin: "\\b0[0-7]+n?\\b" },
      ],
      relevance: 0
    };

    const SUBST = {
      className: 'subst',
      begin: '\\$\\{',
      end: '\\}',
      keywords: KEYWORDS$1,
      contains: [] // defined later
    };
    const HTML_TEMPLATE = {
      begin: '\.?html`',
      end: '',
      starts: {
        end: '`',
        returnEnd: false,
        contains: [
          hljs.BACKSLASH_ESCAPE,
          SUBST
        ],
        subLanguage: 'xml'
      }
    };
    const CSS_TEMPLATE = {
      begin: '\.?css`',
      end: '',
      starts: {
        end: '`',
        returnEnd: false,
        contains: [
          hljs.BACKSLASH_ESCAPE,
          SUBST
        ],
        subLanguage: 'css'
      }
    };
    const GRAPHQL_TEMPLATE = {
      begin: '\.?gql`',
      end: '',
      starts: {
        end: '`',
        returnEnd: false,
        contains: [
          hljs.BACKSLASH_ESCAPE,
          SUBST
        ],
        subLanguage: 'graphql'
      }
    };
    const TEMPLATE_STRING = {
      className: 'string',
      begin: '`',
      end: '`',
      contains: [
        hljs.BACKSLASH_ESCAPE,
        SUBST
      ]
    };
    const JSDOC_COMMENT = hljs.COMMENT(
      /\/\*\*(?!\/)/,
      '\\*/',
      {
        relevance: 0,
        contains: [
          {
            begin: '(?=@[A-Za-z]+)',
            relevance: 0,
            contains: [
              {
                className: 'doctag',
                begin: '@[A-Za-z]+'
              },
              {
                className: 'type',
                begin: '\\{',
                end: '\\}',
                excludeEnd: true,
                excludeBegin: true,
                relevance: 0
              },
              {
                className: 'variable',
                begin: IDENT_RE$1 + '(?=\\s*(-)|$)',
                endsParent: true,
                relevance: 0
              },
              // eat spaces (not newlines) so we can find
              // types or variables
              {
                begin: /(?=[^\n])\s/,
                relevance: 0
              }
            ]
          }
        ]
      }
    );
    const COMMENT = {
      className: "comment",
      variants: [
        JSDOC_COMMENT,
        hljs.C_BLOCK_COMMENT_MODE,
        hljs.C_LINE_COMMENT_MODE
      ]
    };
    const SUBST_INTERNALS = [
      hljs.APOS_STRING_MODE,
      hljs.QUOTE_STRING_MODE,
      HTML_TEMPLATE,
      CSS_TEMPLATE,
      GRAPHQL_TEMPLATE,
      TEMPLATE_STRING,
      // Skip numbers when they are part of a variable name
      { match: /\$\d+/ },
      NUMBER,
      // This is intentional:
      // See https://github.com/highlightjs/highlight.js/issues/3288
      // hljs.REGEXP_MODE
    ];
    SUBST.contains = SUBST_INTERNALS
      .concat({
        // we need to pair up {} inside our subst to prevent
        // it from ending too early by matching another }
        begin: /\{/,
        end: /\}/,
        keywords: KEYWORDS$1,
        contains: [
          "self"
        ].concat(SUBST_INTERNALS)
      });
    const SUBST_AND_COMMENTS = [].concat(COMMENT, SUBST.contains);
    const PARAMS_CONTAINS = SUBST_AND_COMMENTS.concat([
      // eat recursive parens in sub expressions
      {
        begin: /(\s*)\(/,
        end: /\)/,
        keywords: KEYWORDS$1,
        contains: ["self"].concat(SUBST_AND_COMMENTS)
      }
    ]);
    const PARAMS = {
      className: 'params',
      // convert this to negative lookbehind in v12
      begin: /(\s*)\(/, // to match the parms with
      end: /\)/,
      excludeBegin: true,
      excludeEnd: true,
      keywords: KEYWORDS$1,
      contains: PARAMS_CONTAINS
    };

    // ES6 classes
    const CLASS_OR_EXTENDS = {
      variants: [
        // class Car extends vehicle
        {
          match: [
            /class/,
            /\s+/,
            IDENT_RE$1,
            /\s+/,
            /extends/,
            /\s+/,
            regex.concat(IDENT_RE$1, "(", regex.concat(/\./, IDENT_RE$1), ")*")
          ],
          scope: {
            1: "keyword",
            3: "title.class",
            5: "keyword",
            7: "title.class.inherited"
          }
        },
        // class Car
        {
          match: [
            /class/,
            /\s+/,
            IDENT_RE$1
          ],
          scope: {
            1: "keyword",
            3: "title.class"
          }
        },

      ]
    };

    const CLASS_REFERENCE = {
      relevance: 0,
      match:
      regex.either(
        // Hard coded exceptions
        /\bJSON/,
        // Float32Array, OutT
        /\b[A-Z][a-z]+([A-Z][a-z]*|\d)*/,
        // CSSFactory, CSSFactoryT
        /\b[A-Z]{2,}([A-Z][a-z]+|\d)+([A-Z][a-z]*)*/,
        // FPs, FPsT
        /\b[A-Z]{2,}[a-z]+([A-Z][a-z]+|\d)*([A-Z][a-z]*)*/,
        // P
        // single letters are not highlighted
        // BLAH
        // this will be flagged as a UPPER_CASE_CONSTANT instead
      ),
      className: "title.class",
      keywords: {
        _: [
          // se we still get relevance credit for JS library classes
          ...TYPES,
          ...ERROR_TYPES
        ]
      }
    };

    const USE_STRICT = {
      label: "use_strict",
      className: 'meta',
      relevance: 10,
      begin: /^\s*['"]use (strict|asm)['"]/
    };

    const FUNCTION_DEFINITION = {
      variants: [
        {
          match: [
            /function/,
            /\s+/,
            IDENT_RE$1,
            /(?=\s*\()/
          ]
        },
        // anonymous function
        {
          match: [
            /function/,
            /\s*(?=\()/
          ]
        }
      ],
      className: {
        1: "keyword",
        3: "title.function"
      },
      label: "func.def",
      contains: [ PARAMS ],
      illegal: /%/
    };

    const UPPER_CASE_CONSTANT = {
      relevance: 0,
      match: /\b[A-Z][A-Z_0-9]+\b/,
      className: "variable.constant"
    };

    function noneOf(list) {
      return regex.concat("(?!", list.join("|"), ")");
    }

    const FUNCTION_CALL = {
      match: regex.concat(
        /\b/,
        noneOf([
          ...BUILT_IN_GLOBALS,
          "super",
          "import"
        ].map(x => `${x}\\s*\\(`)),
        IDENT_RE$1, regex.lookahead(/\s*\(/)),
      className: "title.function",
      relevance: 0
    };

    const PROPERTY_ACCESS = {
      begin: regex.concat(/\./, regex.lookahead(
        regex.concat(IDENT_RE$1, /(?![0-9A-Za-z$_(])/)
      )),
      end: IDENT_RE$1,
      excludeBegin: true,
      keywords: "prototype",
      className: "property",
      relevance: 0
    };

    const GETTER_OR_SETTER = {
      match: [
        /get|set/,
        /\s+/,
        IDENT_RE$1,
        /(?=\()/
      ],
      className: {
        1: "keyword",
        3: "title.function"
      },
      contains: [
        { // eat to avoid empty params
          begin: /\(\)/
        },
        PARAMS
      ]
    };

    const FUNC_LEAD_IN_RE = '(\\(' +
      '[^()]*(\\(' +
      '[^()]*(\\(' +
      '[^()]*' +
      '\\)[^()]*)*' +
      '\\)[^()]*)*' +
      '\\)|' + hljs.UNDERSCORE_IDENT_RE + ')\\s*=>';

    const FUNCTION_VARIABLE = {
      match: [
        /const|var|let/, /\s+/,
        IDENT_RE$1, /\s*/,
        /=\s*/,
        /(async\s*)?/, // async is optional
        regex.lookahead(FUNC_LEAD_IN_RE)
      ],
      keywords: "async",
      className: {
        1: "keyword",
        3: "title.function"
      },
      contains: [
        PARAMS
      ]
    };

    return {
      name: 'JavaScript',
      aliases: ['js', 'jsx', 'mjs', 'cjs'],
      keywords: KEYWORDS$1,
      // this will be extended by TypeScript
      exports: { PARAMS_CONTAINS, CLASS_REFERENCE },
      illegal: /#(?![$_A-z])/,
      contains: [
        hljs.SHEBANG({
          label: "shebang",
          binary: "node",
          relevance: 5
        }),
        USE_STRICT,
        hljs.APOS_STRING_MODE,
        hljs.QUOTE_STRING_MODE,
        HTML_TEMPLATE,
        CSS_TEMPLATE,
        GRAPHQL_TEMPLATE,
        TEMPLATE_STRING,
        COMMENT,
        // Skip numbers when they are part of a variable name
        { match: /\$\d+/ },
        NUMBER,
        CLASS_REFERENCE,
        {
          scope: 'attr',
          match: IDENT_RE$1 + regex.lookahead(':'),
          relevance: 0
        },
        FUNCTION_VARIABLE,
        { // "value" container
          begin: '(' + hljs.RE_STARTERS_RE + '|\\b(case|return|throw)\\b)\\s*',
          keywords: 'return throw case',
          relevance: 0,
          contains: [
            COMMENT,
            hljs.REGEXP_MODE,
            {
              className: 'function',
              // we have to count the parens to make sure we actually have the
              // correct bounding ( ) before the =>.  There could be any number of
              // sub-expressions inside also surrounded by parens.
              begin: FUNC_LEAD_IN_RE,
              returnBegin: true,
              end: '\\s*=>',
              contains: [
                {
                  className: 'params',
                  variants: [
                    {
                      begin: hljs.UNDERSCORE_IDENT_RE,
                      relevance: 0
                    },
                    {
                      className: null,
                      begin: /\(\s*\)/,
                      skip: true
                    },
                    {
                      begin: /(\s*)\(/,
                      end: /\)/,
                      excludeBegin: true,
                      excludeEnd: true,
                      keywords: KEYWORDS$1,
                      contains: PARAMS_CONTAINS
                    }
                  ]
                }
              ]
            },
            { // could be a comma delimited list of params to a function call
              begin: /,/,
              relevance: 0
            },
            {
              match: /\s+/,
              relevance: 0
            },
            { // JSX
              variants: [
                { begin: FRAGMENT.begin, end: FRAGMENT.end },
                { match: XML_SELF_CLOSING },
                {
                  begin: XML_TAG.begin,
                  // we carefully check the opening tag to see if it truly
                  // is a tag and not a false positive
                  'on:begin': XML_TAG.isTrulyOpeningTag,
                  end: XML_TAG.end
                }
              ],
              subLanguage: 'xml',
              contains: [
                {
                  begin: XML_TAG.begin,
                  end: XML_TAG.end,
                  skip: true,
                  contains: ['self']
                }
              ]
            }
          ],
        },
        FUNCTION_DEFINITION,
        {
          // prevent this from getting swallowed up by function
          // since they appear "function like"
          beginKeywords: "while if switch catch for"
        },
        {
          // we have to count the parens to make sure we actually have the correct
          // bounding ( ).  There could be any number of sub-expressions inside
          // also surrounded by parens.
          begin: '\\b(?!function)' + hljs.UNDERSCORE_IDENT_RE +
            '\\(' + // first parens
            '[^()]*(\\(' +
              '[^()]*(\\(' +
                '[^()]*' +
              '\\)[^()]*)*' +
            '\\)[^()]*)*' +
            '\\)\\s*\\{', // end parens
          returnBegin:true,
          label: "func.def",
          contains: [
            PARAMS,
            hljs.inherit(hljs.TITLE_MODE, { begin: IDENT_RE$1, className: "title.function" })
          ]
        },
        // catch ... so it won't trigger the property rule below
        {
          match: /\.\.\./,
          relevance: 0
        },
        PROPERTY_ACCESS,
        // hack: prevents detection of keywords in some circumstances
        // .keyword()
        // $keyword = x
        {
          match: '\\$' + IDENT_RE$1,
          relevance: 0
        },
        {
          match: [ /\bconstructor(?=\s*\()/ ],
          className: { 1: "title.function" },
          contains: [ PARAMS ]
        },
        FUNCTION_CALL,
        UPPER_CASE_CONSTANT,
        CLASS_OR_EXTENDS,
        GETTER_OR_SETTER,
        {
          match: /\$[(.]/ // relevance booster for a pattern common to JS libs: `$(something)` and `$.something`
        }
      ]
    };
  }

  return javascript;

})();

    hljs.registerLanguage('javascript', hljsGrammar);
  })();/*! `json` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: JSON
  Description: JSON (JavaScript Object Notation) is a lightweight data-interchange format.
  Author: Ivan Sagalaev <maniac@softwaremaniacs.org>
  Website: http://www.json.org
  Category: common, protocols, web
  */

  function json(hljs) {
    const ATTRIBUTE = {
      className: 'attr',
      begin: /"(\\.|[^\\"\r\n])*"(?=\s*:)/,
      relevance: 1.01
    };
    const PUNCTUATION = {
      match: /[{}[\],:]/,
      className: "punctuation",
      relevance: 0
    };
    const LITERALS = [
      "true",
      "false",
      "null"
    ];
    // NOTE: normally we would rely on `keywords` for this but using a mode here allows us
    // - to use the very tight `illegal: \S` rule later to flag any other character
    // - as illegal indicating that despite looking like JSON we do not truly have
    // - JSON and thus improve false-positively greatly since JSON will try and claim
    // - all sorts of JSON looking stuff
    const LITERALS_MODE = {
      scope: "literal",
      beginKeywords: LITERALS.join(" "),
    };

    return {
      name: 'JSON',
      aliases: ['jsonc'],
      keywords:{
        literal: LITERALS,
      },
      contains: [
        ATTRIBUTE,
        PUNCTUATION,
        hljs.QUOTE_STRING_MODE,
        LITERALS_MODE,
        hljs.C_NUMBER_MODE,
        hljs.C_LINE_COMMENT_MODE,
        hljs.C_BLOCK_COMMENT_MODE
      ],
      illegal: '\\S'
    };
  }

  return json;

})();

    hljs.registerLanguage('json', hljsGrammar);
  })();/*! `julia` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Julia
  Description: Julia is a high-level, high-performance, dynamic programming language.
  Author: Kenta Sato <bicycle1885@gmail.com>
  Contributors: Alex Arslan <ararslan@comcast.net>, Fredrik Ekre <ekrefredrik@gmail.com>
  Website: https://julialang.org
  Category: scientific
  */

  function julia(hljs) {
    // Since there are numerous special names in Julia, it is too much trouble
    // to maintain them by hand. Hence these names (i.e. keywords, literals and
    // built-ins) are automatically generated from Julia 1.5.2 itself through
    // the following scripts for each.

    // ref: https://docs.julialang.org/en/v1/manual/variables/#Allowed-Variable-Names
    const VARIABLE_NAME_RE = '[A-Za-z_\\u00A1-\\uFFFF][A-Za-z_0-9\\u00A1-\\uFFFF]*';

    // # keyword generator, multi-word keywords handled manually below (Julia 1.5.2)
    // import REPL.REPLCompletions
    // res = String["in", "isa", "where"]
    // for kw in collect(x.keyword for x in REPLCompletions.complete_keyword(""))
    //     if !(contains(kw, " ") || kw == "struct")
    //         push!(res, kw)
    //     end
    // end
    // sort!(unique!(res))
    // foreach(x -> println("\'", x, "\',"), res)
    const KEYWORD_LIST = [
      'baremodule',
      'begin',
      'break',
      'catch',
      'ccall',
      'const',
      'continue',
      'do',
      'else',
      'elseif',
      'end',
      'export',
      'false',
      'finally',
      'for',
      'function',
      'global',
      'if',
      'import',
      'in',
      'isa',
      'let',
      'local',
      'macro',
      'module',
      'quote',
      'return',
      'true',
      'try',
      'using',
      'where',
      'while',
    ];

    // # literal generator (Julia 1.5.2)
    // import REPL.REPLCompletions
    // res = String["true", "false"]
    // for compl in filter!(x -> isa(x, REPLCompletions.ModuleCompletion) && (x.parent === Base || x.parent === Core),
    //                     REPLCompletions.completions("", 0)[1])
    //     try
    //         v = eval(Symbol(compl.mod))
    //         if !(v isa Function || v isa Type || v isa TypeVar || v isa Module || v isa Colon)
    //             push!(res, compl.mod)
    //         end
    //     catch e
    //     end
    // end
    // sort!(unique!(res))
    // foreach(x -> println("\'", x, "\',"), res)
    const LITERAL_LIST = [
      'ARGS',
      'C_NULL',
      'DEPOT_PATH',
      'ENDIAN_BOM',
      'ENV',
      'Inf',
      'Inf16',
      'Inf32',
      'Inf64',
      'InsertionSort',
      'LOAD_PATH',
      'MergeSort',
      'NaN',
      'NaN16',
      'NaN32',
      'NaN64',
      'PROGRAM_FILE',
      'QuickSort',
      'RoundDown',
      'RoundFromZero',
      'RoundNearest',
      'RoundNearestTiesAway',
      'RoundNearestTiesUp',
      'RoundToZero',
      'RoundUp',
      'VERSION|0',
      'devnull',
      'false',
      'im',
      'missing',
      'nothing',
      'pi',
      'stderr',
      'stdin',
      'stdout',
      'true',
      'undef',
      'π',
      'ℯ',
    ];

    // # built_in generator (Julia 1.5.2)
    // import REPL.REPLCompletions
    // res = String[]
    // for compl in filter!(x -> isa(x, REPLCompletions.ModuleCompletion) && (x.parent === Base || x.parent === Core),
    //                     REPLCompletions.completions("", 0)[1])
    //     try
    //         v = eval(Symbol(compl.mod))
    //         if (v isa Type || v isa TypeVar) && (compl.mod != "=>")
    //             push!(res, compl.mod)
    //         end
    //     catch e
    //     end
    // end
    // sort!(unique!(res))
    // foreach(x -> println("\'", x, "\',"), res)
    const BUILT_IN_LIST = [
      'AbstractArray',
      'AbstractChannel',
      'AbstractChar',
      'AbstractDict',
      'AbstractDisplay',
      'AbstractFloat',
      'AbstractIrrational',
      'AbstractMatrix',
      'AbstractRange',
      'AbstractSet',
      'AbstractString',
      'AbstractUnitRange',
      'AbstractVecOrMat',
      'AbstractVector',
      'Any',
      'ArgumentError',
      'Array',
      'AssertionError',
      'BigFloat',
      'BigInt',
      'BitArray',
      'BitMatrix',
      'BitSet',
      'BitVector',
      'Bool',
      'BoundsError',
      'CapturedException',
      'CartesianIndex',
      'CartesianIndices',
      'Cchar',
      'Cdouble',
      'Cfloat',
      'Channel',
      'Char',
      'Cint',
      'Cintmax_t',
      'Clong',
      'Clonglong',
      'Cmd',
      'Colon',
      'Complex',
      'ComplexF16',
      'ComplexF32',
      'ComplexF64',
      'CompositeException',
      'Condition',
      'Cptrdiff_t',
      'Cshort',
      'Csize_t',
      'Cssize_t',
      'Cstring',
      'Cuchar',
      'Cuint',
      'Cuintmax_t',
      'Culong',
      'Culonglong',
      'Cushort',
      'Cvoid',
      'Cwchar_t',
      'Cwstring',
      'DataType',
      'DenseArray',
      'DenseMatrix',
      'DenseVecOrMat',
      'DenseVector',
      'Dict',
      'DimensionMismatch',
      'Dims',
      'DivideError',
      'DomainError',
      'EOFError',
      'Enum',
      'ErrorException',
      'Exception',
      'ExponentialBackOff',
      'Expr',
      'Float16',
      'Float32',
      'Float64',
      'Function',
      'GlobalRef',
      'HTML',
      'IO',
      'IOBuffer',
      'IOContext',
      'IOStream',
      'IdDict',
      'IndexCartesian',
      'IndexLinear',
      'IndexStyle',
      'InexactError',
      'InitError',
      'Int',
      'Int128',
      'Int16',
      'Int32',
      'Int64',
      'Int8',
      'Integer',
      'InterruptException',
      'InvalidStateException',
      'Irrational',
      'KeyError',
      'LinRange',
      'LineNumberNode',
      'LinearIndices',
      'LoadError',
      'MIME',
      'Matrix',
      'Method',
      'MethodError',
      'Missing',
      'MissingException',
      'Module',
      'NTuple',
      'NamedTuple',
      'Nothing',
      'Number',
      'OrdinalRange',
      'OutOfMemoryError',
      'OverflowError',
      'Pair',
      'PartialQuickSort',
      'PermutedDimsArray',
      'Pipe',
      'ProcessFailedException',
      'Ptr',
      'QuoteNode',
      'Rational',
      'RawFD',
      'ReadOnlyMemoryError',
      'Real',
      'ReentrantLock',
      'Ref',
      'Regex',
      'RegexMatch',
      'RoundingMode',
      'SegmentationFault',
      'Set',
      'Signed',
      'Some',
      'StackOverflowError',
      'StepRange',
      'StepRangeLen',
      'StridedArray',
      'StridedMatrix',
      'StridedVecOrMat',
      'StridedVector',
      'String',
      'StringIndexError',
      'SubArray',
      'SubString',
      'SubstitutionString',
      'Symbol',
      'SystemError',
      'Task',
      'TaskFailedException',
      'Text',
      'TextDisplay',
      'Timer',
      'Tuple',
      'Type',
      'TypeError',
      'TypeVar',
      'UInt',
      'UInt128',
      'UInt16',
      'UInt32',
      'UInt64',
      'UInt8',
      'UndefInitializer',
      'UndefKeywordError',
      'UndefRefError',
      'UndefVarError',
      'Union',
      'UnionAll',
      'UnitRange',
      'Unsigned',
      'Val',
      'Vararg',
      'VecElement',
      'VecOrMat',
      'Vector',
      'VersionNumber',
      'WeakKeyDict',
      'WeakRef',
    ];

    const KEYWORDS = {
      $pattern: VARIABLE_NAME_RE,
      keyword: KEYWORD_LIST,
      literal: LITERAL_LIST,
      built_in: BUILT_IN_LIST,
    };

    // placeholder for recursive self-reference
    const DEFAULT = {
      keywords: KEYWORDS,
      illegal: /<\//
    };

    // ref: https://docs.julialang.org/en/v1/manual/integers-and-floating-point-numbers/
    const NUMBER = {
      className: 'number',
      // supported numeric literals:
      //  * binary literal (e.g. 0x10)
      //  * octal literal (e.g. 0o76543210)
      //  * hexadecimal literal (e.g. 0xfedcba876543210)
      //  * hexadecimal floating point literal (e.g. 0x1p0, 0x1.2p2)
      //  * decimal literal (e.g. 9876543210, 100_000_000)
      //  * floating pointe literal (e.g. 1.2, 1.2f, .2, 1., 1.2e10, 1.2e-10)
      begin: /(\b0x[\d_]*(\.[\d_]*)?|0x\.\d[\d_]*)p[-+]?\d+|\b0[box][a-fA-F0-9][a-fA-F0-9_]*|(\b\d[\d_]*(\.[\d_]*)?|\.\d[\d_]*)([eEfF][-+]?\d+)?/,
      relevance: 0
    };

    const CHAR = {
      className: 'string',
      begin: /'(.|\\[xXuU][a-zA-Z0-9]+)'/
    };

    const INTERPOLATION = {
      className: 'subst',
      begin: /\$\(/,
      end: /\)/,
      keywords: KEYWORDS
    };

    const INTERPOLATED_VARIABLE = {
      className: 'variable',
      begin: '\\$' + VARIABLE_NAME_RE
    };

    // TODO: neatly escape normal code in string literal
    const STRING = {
      className: 'string',
      contains: [
        hljs.BACKSLASH_ESCAPE,
        INTERPOLATION,
        INTERPOLATED_VARIABLE
      ],
      variants: [
        {
          begin: /\w*"""/,
          end: /"""\w*/,
          relevance: 10
        },
        {
          begin: /\w*"/,
          end: /"\w*/
        }
      ]
    };

    const COMMAND = {
      className: 'string',
      contains: [
        hljs.BACKSLASH_ESCAPE,
        INTERPOLATION,
        INTERPOLATED_VARIABLE
      ],
      begin: '`',
      end: '`'
    };

    const MACROCALL = {
      className: 'meta',
      begin: '@' + VARIABLE_NAME_RE
    };

    const COMMENT = {
      className: 'comment',
      variants: [
        {
          begin: '#=',
          end: '=#',
          relevance: 10
        },
        {
          begin: '#',
          end: '$'
        }
      ]
    };

    DEFAULT.name = 'Julia';
    DEFAULT.contains = [
      NUMBER,
      CHAR,
      STRING,
      COMMAND,
      MACROCALL,
      COMMENT,
      hljs.HASH_COMMENT_MODE,
      {
        className: 'keyword',
        begin:
          '\\b(((abstract|primitive)\\s+)type|(mutable\\s+)?struct)\\b'
      },
      { begin: /<:/ } // relevance booster
    ];
    INTERPOLATION.contains = DEFAULT.contains;

    return DEFAULT;
  }

  return julia;

})();

    hljs.registerLanguage('julia', hljsGrammar);
  })();/*! `kotlin` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  // https://docs.oracle.com/javase/specs/jls/se15/html/jls-3.html#jls-3.10
  var decimalDigits = '[0-9](_*[0-9])*';
  var frac = `\\.(${decimalDigits})`;
  var hexDigits = '[0-9a-fA-F](_*[0-9a-fA-F])*';
  var NUMERIC = {
    className: 'number',
    variants: [
      // DecimalFloatingPointLiteral
      // including ExponentPart
      { begin: `(\\b(${decimalDigits})((${frac})|\\.)?|(${frac}))` +
        `[eE][+-]?(${decimalDigits})[fFdD]?\\b` },
      // excluding ExponentPart
      { begin: `\\b(${decimalDigits})((${frac})[fFdD]?\\b|\\.([fFdD]\\b)?)` },
      { begin: `(${frac})[fFdD]?\\b` },
      { begin: `\\b(${decimalDigits})[fFdD]\\b` },

      // HexadecimalFloatingPointLiteral
      { begin: `\\b0[xX]((${hexDigits})\\.?|(${hexDigits})?\\.(${hexDigits}))` +
        `[pP][+-]?(${decimalDigits})[fFdD]?\\b` },

      // DecimalIntegerLiteral
      { begin: '\\b(0|[1-9](_*[0-9])*)[lL]?\\b' },

      // HexIntegerLiteral
      { begin: `\\b0[xX](${hexDigits})[lL]?\\b` },

      // OctalIntegerLiteral
      { begin: '\\b0(_*[0-7])*[lL]?\\b' },

      // BinaryIntegerLiteral
      { begin: '\\b0[bB][01](_*[01])*[lL]?\\b' },
    ],
    relevance: 0
  };

  /*
   Language: Kotlin
   Description: Kotlin is an OSS statically typed programming language that targets the JVM, Android, JavaScript and Native.
   Author: Sergey Mashkov <cy6erGn0m@gmail.com>
   Website: https://kotlinlang.org
   Category: common
   */


  function kotlin(hljs) {
    const KEYWORDS = {
      keyword:
        'abstract as val var vararg get set class object open private protected public noinline '
        + 'crossinline dynamic final enum if else do while for when throw try catch finally '
        + 'import package is in fun override companion reified inline lateinit init '
        + 'interface annotation data sealed internal infix operator out by constructor super '
        + 'tailrec where const inner suspend typealias external expect actual',
      built_in:
        'Byte Short Char Int Long Boolean Float Double Void Unit Nothing',
      literal:
        'true false null'
    };
    const KEYWORDS_WITH_LABEL = {
      className: 'keyword',
      begin: /\b(break|continue|return|this)\b/,
      starts: { contains: [
        {
          className: 'symbol',
          begin: /@\w+/
        }
      ] }
    };
    const LABEL = {
      className: 'symbol',
      begin: hljs.UNDERSCORE_IDENT_RE + '@'
    };

    // for string templates
    const SUBST = {
      className: 'subst',
      begin: /\$\{/,
      end: /\}/,
      contains: [ hljs.C_NUMBER_MODE ]
    };
    const VARIABLE = {
      className: 'variable',
      begin: '\\$' + hljs.UNDERSCORE_IDENT_RE
    };
    const STRING = {
      className: 'string',
      variants: [
        {
          begin: '"""',
          end: '"""(?=[^"])',
          contains: [
            VARIABLE,
            SUBST
          ]
        },
        // Can't use built-in modes easily, as we want to use STRING in the meta
        // context as 'meta-string' and there's no syntax to remove explicitly set
        // classNames in built-in modes.
        {
          begin: '\'',
          end: '\'',
          illegal: /\n/,
          contains: [ hljs.BACKSLASH_ESCAPE ]
        },
        {
          begin: '"',
          end: '"',
          illegal: /\n/,
          contains: [
            hljs.BACKSLASH_ESCAPE,
            VARIABLE,
            SUBST
          ]
        }
      ]
    };
    SUBST.contains.push(STRING);

    const ANNOTATION_USE_SITE = {
      className: 'meta',
      begin: '@(?:file|property|field|get|set|receiver|param|setparam|delegate)\\s*:(?:\\s*' + hljs.UNDERSCORE_IDENT_RE + ')?'
    };
    const ANNOTATION = {
      className: 'meta',
      begin: '@' + hljs.UNDERSCORE_IDENT_RE,
      contains: [
        {
          begin: /\(/,
          end: /\)/,
          contains: [
            hljs.inherit(STRING, { className: 'string' }),
            "self"
          ]
        }
      ]
    };

    // https://kotlinlang.org/docs/reference/whatsnew11.html#underscores-in-numeric-literals
    // According to the doc above, the number mode of kotlin is the same as java 8,
    // so the code below is copied from java.js
    const KOTLIN_NUMBER_MODE = NUMERIC;
    const KOTLIN_NESTED_COMMENT = hljs.COMMENT(
      '/\\*', '\\*/',
      { contains: [ hljs.C_BLOCK_COMMENT_MODE ] }
    );
    const KOTLIN_PAREN_TYPE = { variants: [
      {
        className: 'type',
        begin: hljs.UNDERSCORE_IDENT_RE
      },
      {
        begin: /\(/,
        end: /\)/,
        contains: [] // defined later
      }
    ] };
    const KOTLIN_PAREN_TYPE2 = KOTLIN_PAREN_TYPE;
    KOTLIN_PAREN_TYPE2.variants[1].contains = [ KOTLIN_PAREN_TYPE ];
    KOTLIN_PAREN_TYPE.variants[1].contains = [ KOTLIN_PAREN_TYPE2 ];

    return {
      name: 'Kotlin',
      aliases: [
        'kt',
        'kts'
      ],
      keywords: KEYWORDS,
      contains: [
        hljs.COMMENT(
          '/\\*\\*',
          '\\*/',
          {
            relevance: 0,
            contains: [
              {
                className: 'doctag',
                begin: '@[A-Za-z]+'
              }
            ]
          }
        ),
        hljs.C_LINE_COMMENT_MODE,
        KOTLIN_NESTED_COMMENT,
        KEYWORDS_WITH_LABEL,
        LABEL,
        ANNOTATION_USE_SITE,
        ANNOTATION,
        {
          className: 'function',
          beginKeywords: 'fun',
          end: '[(]|$',
          returnBegin: true,
          excludeEnd: true,
          keywords: KEYWORDS,
          relevance: 5,
          contains: [
            {
              begin: hljs.UNDERSCORE_IDENT_RE + '\\s*\\(',
              returnBegin: true,
              relevance: 0,
              contains: [ hljs.UNDERSCORE_TITLE_MODE ]
            },
            {
              className: 'type',
              begin: /</,
              end: />/,
              keywords: 'reified',
              relevance: 0
            },
            {
              className: 'params',
              begin: /\(/,
              end: /\)/,
              endsParent: true,
              keywords: KEYWORDS,
              relevance: 0,
              contains: [
                {
                  begin: /:/,
                  end: /[=,\/]/,
                  endsWithParent: true,
                  contains: [
                    KOTLIN_PAREN_TYPE,
                    hljs.C_LINE_COMMENT_MODE,
                    KOTLIN_NESTED_COMMENT
                  ],
                  relevance: 0
                },
                hljs.C_LINE_COMMENT_MODE,
                KOTLIN_NESTED_COMMENT,
                ANNOTATION_USE_SITE,
                ANNOTATION,
                STRING,
                hljs.C_NUMBER_MODE
              ]
            },
            KOTLIN_NESTED_COMMENT
          ]
        },
        {
          begin: [
            /class|interface|trait/,
            /\s+/,
            hljs.UNDERSCORE_IDENT_RE
          ],
          beginScope: {
            3: "title.class"
          },
          keywords: 'class interface trait',
          end: /[:\{(]|$/,
          excludeEnd: true,
          illegal: 'extends implements',
          contains: [
            { beginKeywords: 'public protected internal private constructor' },
            hljs.UNDERSCORE_TITLE_MODE,
            {
              className: 'type',
              begin: /</,
              end: />/,
              excludeBegin: true,
              excludeEnd: true,
              relevance: 0
            },
            {
              className: 'type',
              begin: /[,:]\s*/,
              end: /[<\(,){\s]|$/,
              excludeBegin: true,
              returnEnd: true
            },
            ANNOTATION_USE_SITE,
            ANNOTATION
          ]
        },
        STRING,
        {
          className: 'meta',
          begin: "^#!/usr/bin/env",
          end: '$',
          illegal: '\n'
        },
        KOTLIN_NUMBER_MODE
      ]
    };
  }

  return kotlin;

})();

    hljs.registerLanguage('kotlin', hljsGrammar);
  })();/*! `latex` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: LaTeX
  Author: Benedikt Wilde <bwilde@posteo.de>
  Website: https://www.latex-project.org
  Category: markup
  */

  /** @type LanguageFn */
  function latex(hljs) {
    const regex = hljs.regex;
    const KNOWN_CONTROL_WORDS = regex.either(...[
      '(?:NeedsTeXFormat|RequirePackage|GetIdInfo)',
      'Provides(?:Expl)?(?:Package|Class|File)',
      '(?:DeclareOption|ProcessOptions)',
      '(?:documentclass|usepackage|input|include)',
      'makeat(?:letter|other)',
      'ExplSyntax(?:On|Off)',
      '(?:new|renew|provide)?command',
      '(?:re)newenvironment',
      '(?:New|Renew|Provide|Declare)(?:Expandable)?DocumentCommand',
      '(?:New|Renew|Provide|Declare)DocumentEnvironment',
      '(?:(?:e|g|x)?def|let)',
      '(?:begin|end)',
      '(?:part|chapter|(?:sub){0,2}section|(?:sub)?paragraph)',
      'caption',
      '(?:label|(?:eq|page|name)?ref|(?:paren|foot|super)?cite)',
      '(?:alpha|beta|[Gg]amma|[Dd]elta|(?:var)?epsilon|zeta|eta|[Tt]heta|vartheta)',
      '(?:iota|(?:var)?kappa|[Ll]ambda|mu|nu|[Xx]i|[Pp]i|varpi|(?:var)rho)',
      '(?:[Ss]igma|varsigma|tau|[Uu]psilon|[Pp]hi|varphi|chi|[Pp]si|[Oo]mega)',
      '(?:frac|sum|prod|lim|infty|times|sqrt|leq|geq|left|right|middle|[bB]igg?)',
      '(?:[lr]angle|q?quad|[lcvdi]?dots|d?dot|hat|tilde|bar)'
    ].map(word => word + '(?![a-zA-Z@:_])'));
    const L3_REGEX = new RegExp([
      // A function \module_function_name:signature or \__module_function_name:signature,
      // where both module and function_name need at least two characters and
      // function_name may contain single underscores.
      '(?:__)?[a-zA-Z]{2,}_[a-zA-Z](?:_?[a-zA-Z])+:[a-zA-Z]*',
      // A variable \scope_module_and_name_type or \scope__module_ane_name_type,
      // where scope is one of l, g or c, type needs at least two characters
      // and module_and_name may contain single underscores.
      '[lgc]__?[a-zA-Z](?:_?[a-zA-Z])*_[a-zA-Z]{2,}',
      // A quark \q_the_name or \q__the_name or
      // scan mark \s_the_name or \s__vthe_name,
      // where variable_name needs at least two characters and
      // may contain single underscores.
      '[qs]__?[a-zA-Z](?:_?[a-zA-Z])+',
      // Other LaTeX3 macro names that are not covered by the three rules above.
      'use(?:_i)?:[a-zA-Z]*',
      '(?:else|fi|or):',
      '(?:if|cs|exp):w',
      '(?:hbox|vbox):n',
      '::[a-zA-Z]_unbraced',
      '::[a-zA-Z:]'
    ].map(pattern => pattern + '(?![a-zA-Z:_])').join('|'));
    const L2_VARIANTS = [
      { begin: /[a-zA-Z@]+/ }, // control word
      { begin: /[^a-zA-Z@]?/ } // control symbol
    ];
    const DOUBLE_CARET_VARIANTS = [
      { begin: /\^{6}[0-9a-f]{6}/ },
      { begin: /\^{5}[0-9a-f]{5}/ },
      { begin: /\^{4}[0-9a-f]{4}/ },
      { begin: /\^{3}[0-9a-f]{3}/ },
      { begin: /\^{2}[0-9a-f]{2}/ },
      { begin: /\^{2}[\u0000-\u007f]/ }
    ];
    const CONTROL_SEQUENCE = {
      className: 'keyword',
      begin: /\\/,
      relevance: 0,
      contains: [
        {
          endsParent: true,
          begin: KNOWN_CONTROL_WORDS
        },
        {
          endsParent: true,
          begin: L3_REGEX
        },
        {
          endsParent: true,
          variants: DOUBLE_CARET_VARIANTS
        },
        {
          endsParent: true,
          relevance: 0,
          variants: L2_VARIANTS
        }
      ]
    };
    const MACRO_PARAM = {
      className: 'params',
      relevance: 0,
      begin: /#+\d?/
    };
    const DOUBLE_CARET_CHAR = {
      // relevance: 1
      variants: DOUBLE_CARET_VARIANTS };
    const SPECIAL_CATCODE = {
      className: 'built_in',
      relevance: 0,
      begin: /[$&^_]/
    };
    const MAGIC_COMMENT = {
      className: 'meta',
      begin: /% ?!(T[eE]X|tex|BIB|bib)/,
      end: '$',
      relevance: 10
    };
    const COMMENT = hljs.COMMENT(
      '%',
      '$',
      { relevance: 0 }
    );
    const EVERYTHING_BUT_VERBATIM = [
      CONTROL_SEQUENCE,
      MACRO_PARAM,
      DOUBLE_CARET_CHAR,
      SPECIAL_CATCODE,
      MAGIC_COMMENT,
      COMMENT
    ];
    const BRACE_GROUP_NO_VERBATIM = {
      begin: /\{/,
      end: /\}/,
      relevance: 0,
      contains: [
        'self',
        ...EVERYTHING_BUT_VERBATIM
      ]
    };
    const ARGUMENT_BRACES = hljs.inherit(
      BRACE_GROUP_NO_VERBATIM,
      {
        relevance: 0,
        endsParent: true,
        contains: [
          BRACE_GROUP_NO_VERBATIM,
          ...EVERYTHING_BUT_VERBATIM
        ]
      }
    );
    const ARGUMENT_BRACKETS = {
      begin: /\[/,
      end: /\]/,
      endsParent: true,
      relevance: 0,
      contains: [
        BRACE_GROUP_NO_VERBATIM,
        ...EVERYTHING_BUT_VERBATIM
      ]
    };
    const SPACE_GOBBLER = {
      begin: /\s+/,
      relevance: 0
    };
    const ARGUMENT_M = [ ARGUMENT_BRACES ];
    const ARGUMENT_O = [ ARGUMENT_BRACKETS ];
    const ARGUMENT_AND_THEN = function(arg, starts_mode) {
      return {
        contains: [ SPACE_GOBBLER ],
        starts: {
          relevance: 0,
          contains: arg,
          starts: starts_mode
        }
      };
    };
    const CSNAME = function(csname, starts_mode) {
      return {
        begin: '\\\\' + csname + '(?![a-zA-Z@:_])',
        keywords: {
          $pattern: /\\[a-zA-Z]+/,
          keyword: '\\' + csname
        },
        relevance: 0,
        contains: [ SPACE_GOBBLER ],
        starts: starts_mode
      };
    };
    const BEGIN_ENV = function(envname, starts_mode) {
      return hljs.inherit(
        {
          begin: '\\\\begin(?=[ \t]*(\\r?\\n[ \t]*)?\\{' + envname + '\\})',
          keywords: {
            $pattern: /\\[a-zA-Z]+/,
            keyword: '\\begin'
          },
          relevance: 0,
        },
        ARGUMENT_AND_THEN(ARGUMENT_M, starts_mode)
      );
    };
    const VERBATIM_DELIMITED_EQUAL = (innerName = "string") => {
      return hljs.END_SAME_AS_BEGIN({
        className: innerName,
        begin: /(.|\r?\n)/,
        end: /(.|\r?\n)/,
        excludeBegin: true,
        excludeEnd: true,
        endsParent: true
      });
    };
    const VERBATIM_DELIMITED_ENV = function(envname) {
      return {
        className: 'string',
        end: '(?=\\\\end\\{' + envname + '\\})'
      };
    };

    const VERBATIM_DELIMITED_BRACES = (innerName = "string") => {
      return {
        relevance: 0,
        begin: /\{/,
        starts: {
          endsParent: true,
          contains: [
            {
              className: innerName,
              end: /(?=\})/,
              endsParent: true,
              contains: [
                {
                  begin: /\{/,
                  end: /\}/,
                  relevance: 0,
                  contains: [ "self" ]
                }
              ],
            }
          ]
        }
      };
    };
    const VERBATIM = [
      ...[
        'verb',
        'lstinline'
      ].map(csname => CSNAME(csname, { contains: [ VERBATIM_DELIMITED_EQUAL() ] })),
      CSNAME('mint', ARGUMENT_AND_THEN(ARGUMENT_M, { contains: [ VERBATIM_DELIMITED_EQUAL() ] })),
      CSNAME('mintinline', ARGUMENT_AND_THEN(ARGUMENT_M, { contains: [
        VERBATIM_DELIMITED_BRACES(),
        VERBATIM_DELIMITED_EQUAL()
      ] })),
      CSNAME('url', { contains: [
        VERBATIM_DELIMITED_BRACES("link"),
        VERBATIM_DELIMITED_BRACES("link")
      ] }),
      CSNAME('hyperref', { contains: [ VERBATIM_DELIMITED_BRACES("link") ] }),
      CSNAME('href', ARGUMENT_AND_THEN(ARGUMENT_O, { contains: [ VERBATIM_DELIMITED_BRACES("link") ] })),
      ...[].concat(...[
        '',
        '\\*'
      ].map(suffix => [
        BEGIN_ENV('verbatim' + suffix, VERBATIM_DELIMITED_ENV('verbatim' + suffix)),
        BEGIN_ENV('filecontents' + suffix, ARGUMENT_AND_THEN(ARGUMENT_M, VERBATIM_DELIMITED_ENV('filecontents' + suffix))),
        ...[
          '',
          'B',
          'L'
        ].map(prefix =>
          BEGIN_ENV(prefix + 'Verbatim' + suffix, ARGUMENT_AND_THEN(ARGUMENT_O, VERBATIM_DELIMITED_ENV(prefix + 'Verbatim' + suffix)))
        )
      ])),
      BEGIN_ENV('minted', ARGUMENT_AND_THEN(ARGUMENT_O, ARGUMENT_AND_THEN(ARGUMENT_M, VERBATIM_DELIMITED_ENV('minted')))),
    ];

    return {
      name: 'LaTeX',
      aliases: [ 'tex' ],
      contains: [
        ...VERBATIM,
        ...EVERYTHING_BUT_VERBATIM
      ]
    };
  }

  return latex;

})();

    hljs.registerLanguage('latex', hljsGrammar);
  })();/*! `leaf` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Leaf
  Description: A Swift-based templating language created for the Vapor project.
  Website: https://docs.vapor.codes/leaf/overview
  Category: template
  */

  function leaf(hljs) {
    const IDENT = /([A-Za-z_][A-Za-z_0-9]*)?/;
    const LITERALS = [
      'true',
      'false',
      'in'
    ];
    const PARAMS = {
      scope: 'params',
      begin: /\(/,
      end: /\)(?=\:?)/,
      endsParent: true,
      relevance: 7,
      contains: [
        {
          scope: 'string',
          begin: '"',
          end: '"'
        },
        {
          scope: 'keyword',
          match: LITERALS.join("|"),
        },
        {
          scope: 'variable',
          match: /[A-Za-z_][A-Za-z_0-9]*/
        },
        {
          scope: 'operator',
          match: /\+|\-|\*|\/|\%|\=\=|\=|\!|\>|\<|\&\&|\|\|/
        }
      ]
    };
    const INSIDE_DISPATCH = {
      match: [
        IDENT,
        /(?=\()/,
      ],
      scope: {
        1: "keyword"
      },
      contains: [ PARAMS ]
    };
    PARAMS.contains.unshift(INSIDE_DISPATCH);
    return {
      name: 'Leaf',
      contains: [
        // #ident():
        {
          match: [
            /#+/,
            IDENT,
            /(?=\()/,
          ],
          scope: {
            1: "punctuation",
            2: "keyword"
          },
          // will start up after the ending `)` match from line ~44
          // just to grab the trailing `:` if we can match it
          starts: {
            contains: [
              {
                match: /\:/,
                scope: "punctuation"
              }
            ]
          },
          contains: [
            PARAMS
          ],
        },
        // #ident or #ident:
        {
          match: [
            /#+/,
            IDENT,
            /:?/,
          ],
          scope: {
            1: "punctuation",
            2: "keyword",
            3: "punctuation"
          }
        },
      ]
    };
  }

  return leaf;

})();

    hljs.registerLanguage('leaf', hljsGrammar);
  })();/*! `less` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  const MODES = (hljs) => {
    return {
      IMPORTANT: {
        scope: 'meta',
        begin: '!important'
      },
      BLOCK_COMMENT: hljs.C_BLOCK_COMMENT_MODE,
      HEXCOLOR: {
        scope: 'number',
        begin: /#(([0-9a-fA-F]{3,4})|(([0-9a-fA-F]{2}){3,4}))\b/
      },
      FUNCTION_DISPATCH: {
        className: "built_in",
        begin: /[\w-]+(?=\()/
      },
      ATTRIBUTE_SELECTOR_MODE: {
        scope: 'selector-attr',
        begin: /\[/,
        end: /\]/,
        illegal: '$',
        contains: [
          hljs.APOS_STRING_MODE,
          hljs.QUOTE_STRING_MODE
        ]
      },
      CSS_NUMBER_MODE: {
        scope: 'number',
        begin: hljs.NUMBER_RE + '(' +
          '%|em|ex|ch|rem' +
          '|vw|vh|vmin|vmax' +
          '|cm|mm|in|pt|pc|px' +
          '|deg|grad|rad|turn' +
          '|s|ms' +
          '|Hz|kHz' +
          '|dpi|dpcm|dppx' +
          ')?',
        relevance: 0
      },
      CSS_VARIABLE: {
        className: "attr",
        begin: /--[A-Za-z_][A-Za-z0-9_-]*/
      }
    };
  };

  const HTML_TAGS = [
    'a',
    'abbr',
    'address',
    'article',
    'aside',
    'audio',
    'b',
    'blockquote',
    'body',
    'button',
    'canvas',
    'caption',
    'cite',
    'code',
    'dd',
    'del',
    'details',
    'dfn',
    'div',
    'dl',
    'dt',
    'em',
    'fieldset',
    'figcaption',
    'figure',
    'footer',
    'form',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'header',
    'hgroup',
    'html',
    'i',
    'iframe',
    'img',
    'input',
    'ins',
    'kbd',
    'label',
    'legend',
    'li',
    'main',
    'mark',
    'menu',
    'nav',
    'object',
    'ol',
    'optgroup',
    'option',
    'p',
    'picture',
    'q',
    'quote',
    'samp',
    'section',
    'select',
    'source',
    'span',
    'strong',
    'summary',
    'sup',
    'table',
    'tbody',
    'td',
    'textarea',
    'tfoot',
    'th',
    'thead',
    'time',
    'tr',
    'ul',
    'var',
    'video'
  ];

  const SVG_TAGS = [
    'defs',
    'g',
    'marker',
    'mask',
    'pattern',
    'svg',
    'switch',
    'symbol',
    'feBlend',
    'feColorMatrix',
    'feComponentTransfer',
    'feComposite',
    'feConvolveMatrix',
    'feDiffuseLighting',
    'feDisplacementMap',
    'feFlood',
    'feGaussianBlur',
    'feImage',
    'feMerge',
    'feMorphology',
    'feOffset',
    'feSpecularLighting',
    'feTile',
    'feTurbulence',
    'linearGradient',
    'radialGradient',
    'stop',
    'circle',
    'ellipse',
    'image',
    'line',
    'path',
    'polygon',
    'polyline',
    'rect',
    'text',
    'use',
    'textPath',
    'tspan',
    'foreignObject',
    'clipPath'
  ];

  const TAGS = [
    ...HTML_TAGS,
    ...SVG_TAGS,
  ];

  // Sorting, then reversing makes sure longer attributes/elements like
  // `font-weight` are matched fully instead of getting false positives on say `font`

  const MEDIA_FEATURES = [
    'any-hover',
    'any-pointer',
    'aspect-ratio',
    'color',
    'color-gamut',
    'color-index',
    'device-aspect-ratio',
    'device-height',
    'device-width',
    'display-mode',
    'forced-colors',
    'grid',
    'height',
    'hover',
    'inverted-colors',
    'monochrome',
    'orientation',
    'overflow-block',
    'overflow-inline',
    'pointer',
    'prefers-color-scheme',
    'prefers-contrast',
    'prefers-reduced-motion',
    'prefers-reduced-transparency',
    'resolution',
    'scan',
    'scripting',
    'update',
    'width',
    // TODO: find a better solution?
    'min-width',
    'max-width',
    'min-height',
    'max-height'
  ].sort().reverse();

  // https://developer.mozilla.org/en-US/docs/Web/CSS/Pseudo-classes
  const PSEUDO_CLASSES = [
    'active',
    'any-link',
    'blank',
    'checked',
    'current',
    'default',
    'defined',
    'dir', // dir()
    'disabled',
    'drop',
    'empty',
    'enabled',
    'first',
    'first-child',
    'first-of-type',
    'fullscreen',
    'future',
    'focus',
    'focus-visible',
    'focus-within',
    'has', // has()
    'host', // host or host()
    'host-context', // host-context()
    'hover',
    'indeterminate',
    'in-range',
    'invalid',
    'is', // is()
    'lang', // lang()
    'last-child',
    'last-of-type',
    'left',
    'link',
    'local-link',
    'not', // not()
    'nth-child', // nth-child()
    'nth-col', // nth-col()
    'nth-last-child', // nth-last-child()
    'nth-last-col', // nth-last-col()
    'nth-last-of-type', //nth-last-of-type()
    'nth-of-type', //nth-of-type()
    'only-child',
    'only-of-type',
    'optional',
    'out-of-range',
    'past',
    'placeholder-shown',
    'read-only',
    'read-write',
    'required',
    'right',
    'root',
    'scope',
    'target',
    'target-within',
    'user-invalid',
    'valid',
    'visited',
    'where' // where()
  ].sort().reverse();

  // https://developer.mozilla.org/en-US/docs/Web/CSS/Pseudo-elements
  const PSEUDO_ELEMENTS = [
    'after',
    'backdrop',
    'before',
    'cue',
    'cue-region',
    'first-letter',
    'first-line',
    'grammar-error',
    'marker',
    'part',
    'placeholder',
    'selection',
    'slotted',
    'spelling-error'
  ].sort().reverse();

  const ATTRIBUTES = [
    'accent-color',
    'align-content',
    'align-items',
    'align-self',
    'alignment-baseline',
    'all',
    'anchor-name',
    'animation',
    'animation-composition',
    'animation-delay',
    'animation-direction',
    'animation-duration',
    'animation-fill-mode',
    'animation-iteration-count',
    'animation-name',
    'animation-play-state',
    'animation-range',
    'animation-range-end',
    'animation-range-start',
    'animation-timeline',
    'animation-timing-function',
    'appearance',
    'aspect-ratio',
    'backdrop-filter',
    'backface-visibility',
    'background',
    'background-attachment',
    'background-blend-mode',
    'background-clip',
    'background-color',
    'background-image',
    'background-origin',
    'background-position',
    'background-position-x',
    'background-position-y',
    'background-repeat',
    'background-size',
    'baseline-shift',
    'block-size',
    'border',
    'border-block',
    'border-block-color',
    'border-block-end',
    'border-block-end-color',
    'border-block-end-style',
    'border-block-end-width',
    'border-block-start',
    'border-block-start-color',
    'border-block-start-style',
    'border-block-start-width',
    'border-block-style',
    'border-block-width',
    'border-bottom',
    'border-bottom-color',
    'border-bottom-left-radius',
    'border-bottom-right-radius',
    'border-bottom-style',
    'border-bottom-width',
    'border-collapse',
    'border-color',
    'border-end-end-radius',
    'border-end-start-radius',
    'border-image',
    'border-image-outset',
    'border-image-repeat',
    'border-image-slice',
    'border-image-source',
    'border-image-width',
    'border-inline',
    'border-inline-color',
    'border-inline-end',
    'border-inline-end-color',
    'border-inline-end-style',
    'border-inline-end-width',
    'border-inline-start',
    'border-inline-start-color',
    'border-inline-start-style',
    'border-inline-start-width',
    'border-inline-style',
    'border-inline-width',
    'border-left',
    'border-left-color',
    'border-left-style',
    'border-left-width',
    'border-radius',
    'border-right',
    'border-right-color',
    'border-right-style',
    'border-right-width',
    'border-spacing',
    'border-start-end-radius',
    'border-start-start-radius',
    'border-style',
    'border-top',
    'border-top-color',
    'border-top-left-radius',
    'border-top-right-radius',
    'border-top-style',
    'border-top-width',
    'border-width',
    'bottom',
    'box-align',
    'box-decoration-break',
    'box-direction',
    'box-flex',
    'box-flex-group',
    'box-lines',
    'box-ordinal-group',
    'box-orient',
    'box-pack',
    'box-shadow',
    'box-sizing',
    'break-after',
    'break-before',
    'break-inside',
    'caption-side',
    'caret-color',
    'clear',
    'clip',
    'clip-path',
    'clip-rule',
    'color',
    'color-interpolation',
    'color-interpolation-filters',
    'color-profile',
    'color-rendering',
    'color-scheme',
    'column-count',
    'column-fill',
    'column-gap',
    'column-rule',
    'column-rule-color',
    'column-rule-style',
    'column-rule-width',
    'column-span',
    'column-width',
    'columns',
    'contain',
    'contain-intrinsic-block-size',
    'contain-intrinsic-height',
    'contain-intrinsic-inline-size',
    'contain-intrinsic-size',
    'contain-intrinsic-width',
    'container',
    'container-name',
    'container-type',
    'content',
    'content-visibility',
    'counter-increment',
    'counter-reset',
    'counter-set',
    'cue',
    'cue-after',
    'cue-before',
    'cursor',
    'cx',
    'cy',
    'direction',
    'display',
    'dominant-baseline',
    'empty-cells',
    'enable-background',
    'field-sizing',
    'fill',
    'fill-opacity',
    'fill-rule',
    'filter',
    'flex',
    'flex-basis',
    'flex-direction',
    'flex-flow',
    'flex-grow',
    'flex-shrink',
    'flex-wrap',
    'float',
    'flood-color',
    'flood-opacity',
    'flow',
    'font',
    'font-display',
    'font-family',
    'font-feature-settings',
    'font-kerning',
    'font-language-override',
    'font-optical-sizing',
    'font-palette',
    'font-size',
    'font-size-adjust',
    'font-smooth',
    'font-smoothing',
    'font-stretch',
    'font-style',
    'font-synthesis',
    'font-synthesis-position',
    'font-synthesis-small-caps',
    'font-synthesis-style',
    'font-synthesis-weight',
    'font-variant',
    'font-variant-alternates',
    'font-variant-caps',
    'font-variant-east-asian',
    'font-variant-emoji',
    'font-variant-ligatures',
    'font-variant-numeric',
    'font-variant-position',
    'font-variation-settings',
    'font-weight',
    'forced-color-adjust',
    'gap',
    'glyph-orientation-horizontal',
    'glyph-orientation-vertical',
    'grid',
    'grid-area',
    'grid-auto-columns',
    'grid-auto-flow',
    'grid-auto-rows',
    'grid-column',
    'grid-column-end',
    'grid-column-start',
    'grid-gap',
    'grid-row',
    'grid-row-end',
    'grid-row-start',
    'grid-template',
    'grid-template-areas',
    'grid-template-columns',
    'grid-template-rows',
    'hanging-punctuation',
    'height',
    'hyphenate-character',
    'hyphenate-limit-chars',
    'hyphens',
    'icon',
    'image-orientation',
    'image-rendering',
    'image-resolution',
    'ime-mode',
    'initial-letter',
    'initial-letter-align',
    'inline-size',
    'inset',
    'inset-area',
    'inset-block',
    'inset-block-end',
    'inset-block-start',
    'inset-inline',
    'inset-inline-end',
    'inset-inline-start',
    'isolation',
    'justify-content',
    'justify-items',
    'justify-self',
    'kerning',
    'left',
    'letter-spacing',
    'lighting-color',
    'line-break',
    'line-height',
    'line-height-step',
    'list-style',
    'list-style-image',
    'list-style-position',
    'list-style-type',
    'margin',
    'margin-block',
    'margin-block-end',
    'margin-block-start',
    'margin-bottom',
    'margin-inline',
    'margin-inline-end',
    'margin-inline-start',
    'margin-left',
    'margin-right',
    'margin-top',
    'margin-trim',
    'marker',
    'marker-end',
    'marker-mid',
    'marker-start',
    'marks',
    'mask',
    'mask-border',
    'mask-border-mode',
    'mask-border-outset',
    'mask-border-repeat',
    'mask-border-slice',
    'mask-border-source',
    'mask-border-width',
    'mask-clip',
    'mask-composite',
    'mask-image',
    'mask-mode',
    'mask-origin',
    'mask-position',
    'mask-repeat',
    'mask-size',
    'mask-type',
    'masonry-auto-flow',
    'math-depth',
    'math-shift',
    'math-style',
    'max-block-size',
    'max-height',
    'max-inline-size',
    'max-width',
    'min-block-size',
    'min-height',
    'min-inline-size',
    'min-width',
    'mix-blend-mode',
    'nav-down',
    'nav-index',
    'nav-left',
    'nav-right',
    'nav-up',
    'none',
    'normal',
    'object-fit',
    'object-position',
    'offset',
    'offset-anchor',
    'offset-distance',
    'offset-path',
    'offset-position',
    'offset-rotate',
    'opacity',
    'order',
    'orphans',
    'outline',
    'outline-color',
    'outline-offset',
    'outline-style',
    'outline-width',
    'overflow',
    'overflow-anchor',
    'overflow-block',
    'overflow-clip-margin',
    'overflow-inline',
    'overflow-wrap',
    'overflow-x',
    'overflow-y',
    'overlay',
    'overscroll-behavior',
    'overscroll-behavior-block',
    'overscroll-behavior-inline',
    'overscroll-behavior-x',
    'overscroll-behavior-y',
    'padding',
    'padding-block',
    'padding-block-end',
    'padding-block-start',
    'padding-bottom',
    'padding-inline',
    'padding-inline-end',
    'padding-inline-start',
    'padding-left',
    'padding-right',
    'padding-top',
    'page',
    'page-break-after',
    'page-break-before',
    'page-break-inside',
    'paint-order',
    'pause',
    'pause-after',
    'pause-before',
    'perspective',
    'perspective-origin',
    'place-content',
    'place-items',
    'place-self',
    'pointer-events',
    'position',
    'position-anchor',
    'position-visibility',
    'print-color-adjust',
    'quotes',
    'r',
    'resize',
    'rest',
    'rest-after',
    'rest-before',
    'right',
    'rotate',
    'row-gap',
    'ruby-align',
    'ruby-position',
    'scale',
    'scroll-behavior',
    'scroll-margin',
    'scroll-margin-block',
    'scroll-margin-block-end',
    'scroll-margin-block-start',
    'scroll-margin-bottom',
    'scroll-margin-inline',
    'scroll-margin-inline-end',
    'scroll-margin-inline-start',
    'scroll-margin-left',
    'scroll-margin-right',
    'scroll-margin-top',
    'scroll-padding',
    'scroll-padding-block',
    'scroll-padding-block-end',
    'scroll-padding-block-start',
    'scroll-padding-bottom',
    'scroll-padding-inline',
    'scroll-padding-inline-end',
    'scroll-padding-inline-start',
    'scroll-padding-left',
    'scroll-padding-right',
    'scroll-padding-top',
    'scroll-snap-align',
    'scroll-snap-stop',
    'scroll-snap-type',
    'scroll-timeline',
    'scroll-timeline-axis',
    'scroll-timeline-name',
    'scrollbar-color',
    'scrollbar-gutter',
    'scrollbar-width',
    'shape-image-threshold',
    'shape-margin',
    'shape-outside',
    'shape-rendering',
    'speak',
    'speak-as',
    'src', // @font-face
    'stop-color',
    'stop-opacity',
    'stroke',
    'stroke-dasharray',
    'stroke-dashoffset',
    'stroke-linecap',
    'stroke-linejoin',
    'stroke-miterlimit',
    'stroke-opacity',
    'stroke-width',
    'tab-size',
    'table-layout',
    'text-align',
    'text-align-all',
    'text-align-last',
    'text-anchor',
    'text-combine-upright',
    'text-decoration',
    'text-decoration-color',
    'text-decoration-line',
    'text-decoration-skip',
    'text-decoration-skip-ink',
    'text-decoration-style',
    'text-decoration-thickness',
    'text-emphasis',
    'text-emphasis-color',
    'text-emphasis-position',
    'text-emphasis-style',
    'text-indent',
    'text-justify',
    'text-orientation',
    'text-overflow',
    'text-rendering',
    'text-shadow',
    'text-size-adjust',
    'text-transform',
    'text-underline-offset',
    'text-underline-position',
    'text-wrap',
    'text-wrap-mode',
    'text-wrap-style',
    'timeline-scope',
    'top',
    'touch-action',
    'transform',
    'transform-box',
    'transform-origin',
    'transform-style',
    'transition',
    'transition-behavior',
    'transition-delay',
    'transition-duration',
    'transition-property',
    'transition-timing-function',
    'translate',
    'unicode-bidi',
    'user-modify',
    'user-select',
    'vector-effect',
    'vertical-align',
    'view-timeline',
    'view-timeline-axis',
    'view-timeline-inset',
    'view-timeline-name',
    'view-transition-name',
    'visibility',
    'voice-balance',
    'voice-duration',
    'voice-family',
    'voice-pitch',
    'voice-range',
    'voice-rate',
    'voice-stress',
    'voice-volume',
    'white-space',
    'white-space-collapse',
    'widows',
    'width',
    'will-change',
    'word-break',
    'word-spacing',
    'word-wrap',
    'writing-mode',
    'x',
    'y',
    'z-index',
    'zoom'
  ].sort().reverse();

  // some grammars use them all as a single group
  const PSEUDO_SELECTORS = PSEUDO_CLASSES.concat(PSEUDO_ELEMENTS).sort().reverse();

  /*
  Language: Less
  Description: It's CSS, with just a little more.
  Author:   Max Mikhailov <seven.phases.max@gmail.com>
  Website: http://lesscss.org
  Category: common, css, web
  */


  /** @type LanguageFn */
  function less(hljs) {
    const modes = MODES(hljs);
    const PSEUDO_SELECTORS$1 = PSEUDO_SELECTORS;

    const AT_MODIFIERS = "and or not only";
    const IDENT_RE = '[\\w-]+'; // yes, Less identifiers may begin with a digit
    const INTERP_IDENT_RE = '(' + IDENT_RE + '|@\\{' + IDENT_RE + '\\})';

    /* Generic Modes */

    const RULES = []; const VALUE_MODES = []; // forward def. for recursive modes

    const STRING_MODE = function(c) {
      return {
      // Less strings are not multiline (also include '~' for more consistent coloring of "escaped" strings)
        className: 'string',
        begin: '~?' + c + '.*?' + c
      };
    };

    const IDENT_MODE = function(name, begin, relevance) {
      return {
        className: name,
        begin: begin,
        relevance: relevance
      };
    };

    const AT_KEYWORDS = {
      $pattern: /[a-z-]+/,
      keyword: AT_MODIFIERS,
      attribute: MEDIA_FEATURES.join(" ")
    };

    const PARENS_MODE = {
      // used only to properly balance nested parens inside mixin call, def. arg list
      begin: '\\(',
      end: '\\)',
      contains: VALUE_MODES,
      keywords: AT_KEYWORDS,
      relevance: 0
    };

    // generic Less highlighter (used almost everywhere except selectors):
    VALUE_MODES.push(
      hljs.C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      STRING_MODE("'"),
      STRING_MODE('"'),
      modes.CSS_NUMBER_MODE, // fixme: it does not include dot for numbers like .5em :(
      {
        begin: '(url|data-uri)\\(',
        starts: {
          className: 'string',
          end: '[\\)\\n]',
          excludeEnd: true
        }
      },
      modes.HEXCOLOR,
      PARENS_MODE,
      IDENT_MODE('variable', '@@?' + IDENT_RE, 10),
      IDENT_MODE('variable', '@\\{' + IDENT_RE + '\\}'),
      IDENT_MODE('built_in', '~?`[^`]*?`'), // inline javascript (or whatever host language) *multiline* string
      { // @media features (it’s here to not duplicate things in AT_RULE_MODE with extra PARENS_MODE overriding):
        className: 'attribute',
        begin: IDENT_RE + '\\s*:',
        end: ':',
        returnBegin: true,
        excludeEnd: true
      },
      modes.IMPORTANT,
      { beginKeywords: 'and not' },
      modes.FUNCTION_DISPATCH
    );

    const VALUE_WITH_RULESETS = VALUE_MODES.concat({
      begin: /\{/,
      end: /\}/,
      contains: RULES
    });

    const MIXIN_GUARD_MODE = {
      beginKeywords: 'when',
      endsWithParent: true,
      contains: [ { beginKeywords: 'and not' } ].concat(VALUE_MODES) // using this form to override VALUE’s 'function' match
    };

    /* Rule-Level Modes */

    const RULE_MODE = {
      begin: INTERP_IDENT_RE + '\\s*:',
      returnBegin: true,
      end: /[;}]/,
      relevance: 0,
      contains: [
        { begin: /-(webkit|moz|ms|o)-/ },
        modes.CSS_VARIABLE,
        {
          className: 'attribute',
          begin: '\\b(' + ATTRIBUTES.join('|') + ')\\b',
          end: /(?=:)/,
          starts: {
            endsWithParent: true,
            illegal: '[<=$]',
            relevance: 0,
            contains: VALUE_MODES
          }
        }
      ]
    };

    const AT_RULE_MODE = {
      className: 'keyword',
      begin: '@(import|media|charset|font-face|(-[a-z]+-)?keyframes|supports|document|namespace|page|viewport|host)\\b',
      starts: {
        end: '[;{}]',
        keywords: AT_KEYWORDS,
        returnEnd: true,
        contains: VALUE_MODES,
        relevance: 0
      }
    };

    // variable definitions and calls
    const VAR_RULE_MODE = {
      className: 'variable',
      variants: [
        // using more strict pattern for higher relevance to increase chances of Less detection.
        // this is *the only* Less specific statement used in most of the sources, so...
        // (we’ll still often loose to the css-parser unless there's '//' comment,
        // simply because 1 variable just can't beat 99 properties :)
        {
          begin: '@' + IDENT_RE + '\\s*:',
          relevance: 15
        },
        { begin: '@' + IDENT_RE }
      ],
      starts: {
        end: '[;}]',
        returnEnd: true,
        contains: VALUE_WITH_RULESETS
      }
    };

    const SELECTOR_MODE = {
      // first parse unambiguous selectors (i.e. those not starting with tag)
      // then fall into the scary lookahead-discriminator variant.
      // this mode also handles mixin definitions and calls
      variants: [
        {
          begin: '[\\.#:&\\[>]',
          end: '[;{}]' // mixin calls end with ';'
        },
        {
          begin: INTERP_IDENT_RE,
          end: /\{/
        }
      ],
      returnBegin: true,
      returnEnd: true,
      illegal: '[<=\'$"]',
      relevance: 0,
      contains: [
        hljs.C_LINE_COMMENT_MODE,
        hljs.C_BLOCK_COMMENT_MODE,
        MIXIN_GUARD_MODE,
        IDENT_MODE('keyword', 'all\\b'),
        IDENT_MODE('variable', '@\\{' + IDENT_RE + '\\}'), // otherwise it’s identified as tag
        
        {
          begin: '\\b(' + TAGS.join('|') + ')\\b',
          className: 'selector-tag'
        },
        modes.CSS_NUMBER_MODE,
        IDENT_MODE('selector-tag', INTERP_IDENT_RE, 0),
        IDENT_MODE('selector-id', '#' + INTERP_IDENT_RE),
        IDENT_MODE('selector-class', '\\.' + INTERP_IDENT_RE, 0),
        IDENT_MODE('selector-tag', '&', 0),
        modes.ATTRIBUTE_SELECTOR_MODE,
        {
          className: 'selector-pseudo',
          begin: ':(' + PSEUDO_CLASSES.join('|') + ')'
        },
        {
          className: 'selector-pseudo',
          begin: ':(:)?(' + PSEUDO_ELEMENTS.join('|') + ')'
        },
        {
          begin: /\(/,
          end: /\)/,
          relevance: 0,
          contains: VALUE_WITH_RULESETS
        }, // argument list of parametric mixins
        { begin: '!important' }, // eat !important after mixin call or it will be colored as tag
        modes.FUNCTION_DISPATCH
      ]
    };

    const PSEUDO_SELECTOR_MODE = {
      begin: IDENT_RE + ':(:)?' + `(${PSEUDO_SELECTORS$1.join('|')})`,
      returnBegin: true,
      contains: [ SELECTOR_MODE ]
    };

    RULES.push(
      hljs.C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      AT_RULE_MODE,
      VAR_RULE_MODE,
      PSEUDO_SELECTOR_MODE,
      RULE_MODE,
      SELECTOR_MODE,
      MIXIN_GUARD_MODE,
      modes.FUNCTION_DISPATCH
    );

    return {
      name: 'Less',
      case_insensitive: true,
      illegal: '[=>\'/<($"]',
      contains: RULES
    };
  }

  return less;

})();

    hljs.registerLanguage('less', hljsGrammar);
  })();/*! `lisp` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Lisp
  Description: Generic lisp syntax
  Author: Vasily Polovnyov <vast@whiteants.net>
  Category: lisp
  */

  function lisp(hljs) {
    const LISP_IDENT_RE = '[a-zA-Z_\\-+\\*\\/<=>&#][a-zA-Z0-9_\\-+*\\/<=>&#!]*';
    const MEC_RE = '\\|[^]*?\\|';
    const LISP_SIMPLE_NUMBER_RE = '(-|\\+)?\\d+(\\.\\d+|\\/\\d+)?((d|e|f|l|s|D|E|F|L|S)(\\+|-)?\\d+)?';
    const LITERAL = {
      className: 'literal',
      begin: '\\b(t{1}|nil)\\b'
    };
    const NUMBER = {
      className: 'number',
      variants: [
        {
          begin: LISP_SIMPLE_NUMBER_RE,
          relevance: 0
        },
        { begin: '#(b|B)[0-1]+(/[0-1]+)?' },
        { begin: '#(o|O)[0-7]+(/[0-7]+)?' },
        { begin: '#(x|X)[0-9a-fA-F]+(/[0-9a-fA-F]+)?' },
        {
          begin: '#(c|C)\\(' + LISP_SIMPLE_NUMBER_RE + ' +' + LISP_SIMPLE_NUMBER_RE,
          end: '\\)'
        }
      ]
    };
    const STRING = hljs.inherit(hljs.QUOTE_STRING_MODE, { illegal: null });
    const COMMENT = hljs.COMMENT(
      ';', '$',
      { relevance: 0 }
    );
    const VARIABLE = {
      begin: '\\*',
      end: '\\*'
    };
    const KEYWORD = {
      className: 'symbol',
      begin: '[:&]' + LISP_IDENT_RE
    };
    const IDENT = {
      begin: LISP_IDENT_RE,
      relevance: 0
    };
    const MEC = { begin: MEC_RE };
    const QUOTED_LIST = {
      begin: '\\(',
      end: '\\)',
      contains: [
        'self',
        LITERAL,
        STRING,
        NUMBER,
        IDENT
      ]
    };
    const QUOTED = {
      contains: [
        NUMBER,
        STRING,
        VARIABLE,
        KEYWORD,
        QUOTED_LIST,
        IDENT
      ],
      variants: [
        {
          begin: '[\'`]\\(',
          end: '\\)'
        },
        {
          begin: '\\(quote ',
          end: '\\)',
          keywords: { name: 'quote' }
        },
        { begin: '\'' + MEC_RE }
      ]
    };
    const QUOTED_ATOM = { variants: [
      { begin: '\'' + LISP_IDENT_RE },
      { begin: '#\'' + LISP_IDENT_RE + '(::' + LISP_IDENT_RE + ')*' }
    ] };
    const LIST = {
      begin: '\\(\\s*',
      end: '\\)'
    };
    const BODY = {
      endsWithParent: true,
      relevance: 0
    };
    LIST.contains = [
      {
        className: 'name',
        variants: [
          {
            begin: LISP_IDENT_RE,
            relevance: 0,
          },
          { begin: MEC_RE }
        ]
      },
      BODY
    ];
    BODY.contains = [
      QUOTED,
      QUOTED_ATOM,
      LIST,
      LITERAL,
      NUMBER,
      STRING,
      COMMENT,
      VARIABLE,
      KEYWORD,
      MEC,
      IDENT
    ];

    return {
      name: 'Lisp',
      illegal: /\S/,
      contains: [
        NUMBER,
        hljs.SHEBANG(),
        LITERAL,
        STRING,
        COMMENT,
        QUOTED,
        QUOTED_ATOM,
        LIST,
        IDENT
      ]
    };
  }

  return lisp;

})();

    hljs.registerLanguage('lisp', hljsGrammar);
  })();/*! `lua` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Lua
  Description: Lua is a powerful, efficient, lightweight, embeddable scripting language.
  Author: Andrew Fedorov <dmmdrs@mail.ru>
  Category: common, gaming, scripting
  Website: https://www.lua.org
  */

  function lua(hljs) {
    const OPENING_LONG_BRACKET = '\\[=*\\[';
    const CLOSING_LONG_BRACKET = '\\]=*\\]';
    const LONG_BRACKETS = {
      begin: OPENING_LONG_BRACKET,
      end: CLOSING_LONG_BRACKET,
      contains: [ 'self' ]
    };
    const COMMENTS = [
      hljs.COMMENT('--(?!' + OPENING_LONG_BRACKET + ')', '$'),
      hljs.COMMENT(
        '--' + OPENING_LONG_BRACKET,
        CLOSING_LONG_BRACKET,
        {
          contains: [ LONG_BRACKETS ],
          relevance: 10
        }
      )
    ];
    return {
      name: 'Lua',
      aliases: ['pluto'],
      keywords: {
        $pattern: hljs.UNDERSCORE_IDENT_RE,
        literal: "true false nil",
        keyword: "and break do else elseif end for goto if in local not or repeat return then until while",
        built_in:
          // Metatags and globals:
          '_G _ENV _VERSION __index __newindex __mode __call __metatable __tostring __len '
          + '__gc __add __sub __mul __div __mod __pow __concat __unm __eq __lt __le assert '
          // Standard methods and properties:
          + 'collectgarbage dofile error getfenv getmetatable ipairs load loadfile loadstring '
          + 'module next pairs pcall print rawequal rawget rawset require select setfenv '
          + 'setmetatable tonumber tostring type unpack xpcall arg self '
          // Library methods and properties (one line per library):
          + 'coroutine resume yield status wrap create running debug getupvalue '
          + 'debug sethook getmetatable gethook setmetatable setlocal traceback setfenv getinfo setupvalue getlocal getregistry getfenv '
          + 'io lines write close flush open output type read stderr stdin input stdout popen tmpfile '
          + 'math log max acos huge ldexp pi cos tanh pow deg tan cosh sinh random randomseed frexp ceil floor rad abs sqrt modf asin min mod fmod log10 atan2 exp sin atan '
          + 'os exit setlocale date getenv difftime remove time clock tmpname rename execute package preload loadlib loaded loaders cpath config path seeall '
          + 'string sub upper len gfind rep find match char dump gmatch reverse byte format gsub lower '
          + 'table setn insert getn foreachi maxn foreach concat sort remove'
      },
      contains: COMMENTS.concat([
        {
          className: 'function',
          beginKeywords: 'function',
          end: '\\)',
          contains: [
            hljs.inherit(hljs.TITLE_MODE, { begin: '([_a-zA-Z]\\w*\\.)*([_a-zA-Z]\\w*:)?[_a-zA-Z]\\w*' }),
            {
              className: 'params',
              begin: '\\(',
              endsWithParent: true,
              contains: COMMENTS
            }
          ].concat(COMMENTS)
        },
        hljs.C_NUMBER_MODE,
        hljs.APOS_STRING_MODE,
        hljs.QUOTE_STRING_MODE,
        {
          className: 'string',
          begin: OPENING_LONG_BRACKET,
          end: CLOSING_LONG_BRACKET,
          contains: [ LONG_BRACKETS ],
          relevance: 5
        }
      ])
    };
  }

  return lua;

})();

    hljs.registerLanguage('lua', hljsGrammar);
  })();/*! `makefile` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Makefile
  Author: Ivan Sagalaev <maniac@softwaremaniacs.org>
  Contributors: Joël Porquet <joel@porquet.org>
  Website: https://www.gnu.org/software/make/manual/html_node/Introduction.html
  Category: common, build-system
  */

  function makefile(hljs) {
    /* Variables: simple (eg $(var)) and special (eg $@) */
    const VARIABLE = {
      className: 'variable',
      variants: [
        {
          begin: '\\$\\(' + hljs.UNDERSCORE_IDENT_RE + '\\)',
          contains: [ hljs.BACKSLASH_ESCAPE ]
        },
        { begin: /\$[@%<?\^\+\*]/ }
      ]
    };
    /* Quoted string with variables inside */
    const QUOTE_STRING = {
      className: 'string',
      begin: /"/,
      end: /"/,
      contains: [
        hljs.BACKSLASH_ESCAPE,
        VARIABLE
      ]
    };
    /* Function: $(func arg,...) */
    const FUNC = {
      className: 'variable',
      begin: /\$\([\w-]+\s/,
      end: /\)/,
      keywords: { built_in:
          'subst patsubst strip findstring filter filter-out sort '
          + 'word wordlist firstword lastword dir notdir suffix basename '
          + 'addsuffix addprefix join wildcard realpath abspath error warning '
          + 'shell origin flavor foreach if or and call eval file value' },
      contains: [ 
        VARIABLE,
        QUOTE_STRING // Added QUOTE_STRING as they can be a part of functions
      ]
    };
    /* Variable assignment */
    const ASSIGNMENT = { begin: '^' + hljs.UNDERSCORE_IDENT_RE + '\\s*(?=[:+?]?=)' };
    /* Meta targets (.PHONY) */
    const META = {
      className: 'meta',
      begin: /^\.PHONY:/,
      end: /$/,
      keywords: {
        $pattern: /[\.\w]+/,
        keyword: '.PHONY'
      }
    };
    /* Targets */
    const TARGET = {
      className: 'section',
      begin: /^[^\s]+:/,
      end: /$/,
      contains: [ VARIABLE ]
    };
    return {
      name: 'Makefile',
      aliases: [
        'mk',
        'mak',
        'make',
      ],
      keywords: {
        $pattern: /[\w-]+/,
        keyword: 'define endef undefine ifdef ifndef ifeq ifneq else endif '
        + 'include -include sinclude override export unexport private vpath'
      },
      contains: [
        hljs.HASH_COMMENT_MODE,
        VARIABLE,
        QUOTE_STRING,
        FUNC,
        ASSIGNMENT,
        META,
        TARGET
      ]
    };
  }

  return makefile;

})();

    hljs.registerLanguage('makefile', hljsGrammar);
  })();/*! `markdown` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Markdown
  Requires: xml.js
  Author: John Crepezzi <john.crepezzi@gmail.com>
  Website: https://daringfireball.net/projects/markdown/
  Category: common, markup
  */

  function markdown(hljs) {
    const regex = hljs.regex;
    const INLINE_HTML = {
      begin: /<\/?[A-Za-z_]/,
      end: '>',
      subLanguage: 'xml',
      relevance: 0
    };
    const HORIZONTAL_RULE = {
      begin: '^[-\\*]{3,}',
      end: '$'
    };
    const CODE = {
      className: 'code',
      variants: [
        // TODO: fix to allow these to work with sublanguage also
        { begin: '(`{3,})[^`](.|\\n)*?\\1`*[ ]*' },
        { begin: '(~{3,})[^~](.|\\n)*?\\1~*[ ]*' },
        // needed to allow markdown as a sublanguage to work
        {
          begin: '```',
          end: '```+[ ]*$'
        },
        {
          begin: '~~~',
          end: '~~~+[ ]*$'
        },
        { begin: '`.+?`' },
        {
          begin: '(?=^( {4}|\\t))',
          // use contains to gobble up multiple lines to allow the block to be whatever size
          // but only have a single open/close tag vs one per line
          contains: [
            {
              begin: '^( {4}|\\t)',
              end: '(\\n)$'
            }
          ],
          relevance: 0
        }
      ]
    };
    const LIST = {
      className: 'bullet',
      begin: '^[ \t]*([*+-]|(\\d+\\.))(?=\\s+)',
      end: '\\s+',
      excludeEnd: true
    };
    const LINK_REFERENCE = {
      begin: /^\[[^\n]+\]:/,
      returnBegin: true,
      contains: [
        {
          className: 'symbol',
          begin: /\[/,
          end: /\]/,
          excludeBegin: true,
          excludeEnd: true
        },
        {
          className: 'link',
          begin: /:\s*/,
          end: /$/,
          excludeBegin: true
        }
      ]
    };
    const URL_SCHEME = /[A-Za-z][A-Za-z0-9+.-]*/;
    const LINK = {
      variants: [
        // too much like nested array access in so many languages
        // to have any real relevance
        {
          begin: /\[.+?\]\[.*?\]/,
          relevance: 0
        },
        // popular internet URLs
        {
          begin: /\[.+?\]\(((data|javascript|mailto):|(?:http|ftp)s?:\/\/).*?\)/,
          relevance: 2
        },
        {
          begin: regex.concat(/\[.+?\]\(/, URL_SCHEME, /:\/\/.*?\)/),
          relevance: 2
        },
        // relative urls
        {
          begin: /\[.+?\]\([./?&#].*?\)/,
          relevance: 1
        },
        // whatever else, lower relevance (might not be a link at all)
        {
          begin: /\[.*?\]\(.*?\)/,
          relevance: 0
        }
      ],
      returnBegin: true,
      contains: [
        {
          // empty strings for alt or link text
          match: /\[(?=\])/ },
        {
          className: 'string',
          relevance: 0,
          begin: '\\[',
          end: '\\]',
          excludeBegin: true,
          returnEnd: true
        },
        {
          className: 'link',
          relevance: 0,
          begin: '\\]\\(',
          end: '\\)',
          excludeBegin: true,
          excludeEnd: true
        },
        {
          className: 'symbol',
          relevance: 0,
          begin: '\\]\\[',
          end: '\\]',
          excludeBegin: true,
          excludeEnd: true
        }
      ]
    };
    const BOLD = {
      className: 'strong',
      contains: [], // defined later
      variants: [
        {
          begin: /_{2}(?!\s)/,
          end: /_{2}/
        },
        {
          begin: /\*{2}(?!\s)/,
          end: /\*{2}/
        }
      ]
    };
    const ITALIC = {
      className: 'emphasis',
      contains: [], // defined later
      variants: [
        {
          begin: /\*(?![*\s])/,
          end: /\*/
        },
        {
          begin: /_(?![_\s])/,
          end: /_/,
          relevance: 0
        }
      ]
    };

    // 3 level deep nesting is not allowed because it would create confusion
    // in cases like `***testing***` because where we don't know if the last
    // `***` is starting a new bold/italic or finishing the last one
    const BOLD_WITHOUT_ITALIC = hljs.inherit(BOLD, { contains: [] });
    const ITALIC_WITHOUT_BOLD = hljs.inherit(ITALIC, { contains: [] });
    BOLD.contains.push(ITALIC_WITHOUT_BOLD);
    ITALIC.contains.push(BOLD_WITHOUT_ITALIC);

    let CONTAINABLE = [
      INLINE_HTML,
      LINK
    ];

    [
      BOLD,
      ITALIC,
      BOLD_WITHOUT_ITALIC,
      ITALIC_WITHOUT_BOLD
    ].forEach(m => {
      m.contains = m.contains.concat(CONTAINABLE);
    });

    CONTAINABLE = CONTAINABLE.concat(BOLD, ITALIC);

    const HEADER = {
      className: 'section',
      variants: [
        {
          begin: '^#{1,6}',
          end: '$',
          contains: CONTAINABLE
        },
        {
          begin: '(?=^.+?\\n[=-]{2,}$)',
          contains: [
            { begin: '^[=-]*$' },
            {
              begin: '^',
              end: "\\n",
              contains: CONTAINABLE
            }
          ]
        }
      ]
    };

    const BLOCKQUOTE = {
      className: 'quote',
      begin: '^>\\s+',
      contains: CONTAINABLE,
      end: '$'
    };

    const ENTITY = {
      //https://spec.commonmark.org/0.31.2/#entity-references
      scope: 'literal',
      match: /&([a-zA-Z0-9]+|#[0-9]{1,7}|#[Xx][0-9a-fA-F]{1,6});/
    };

    return {
      name: 'Markdown',
      aliases: [
        'md',
        'mkdown',
        'mkd'
      ],
      contains: [
        HEADER,
        INLINE_HTML,
        LIST,
        BOLD,
        ITALIC,
        BLOCKQUOTE,
        CODE,
        HORIZONTAL_RULE,
        LINK,
        LINK_REFERENCE,
        ENTITY
      ]
    };
  }

  return markdown;

})();

    hljs.registerLanguage('markdown', hljsGrammar);
  })();/*! `mojolicious` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Mojolicious
  Requires: xml.js, perl.js
  Author: Dotan Dimet <dotan@corky.net>
  Description: Mojolicious .ep (Embedded Perl) templates
  Website: https://mojolicious.org
  Category: template
  */
  function mojolicious(hljs) {
    return {
      name: 'Mojolicious',
      subLanguage: 'xml',
      contains: [
        {
          className: 'meta',
          begin: '^__(END|DATA)__$'
        },
        // mojolicious line
        {
          begin: "^\\s*%{1,2}={0,2}",
          end: '$',
          subLanguage: 'perl'
        },
        // mojolicious block
        {
          begin: "<%{1,2}={0,2}",
          end: "={0,1}%>",
          subLanguage: 'perl',
          excludeBegin: true,
          excludeEnd: true
        }
      ]
    };
  }

  return mojolicious;

})();

    hljs.registerLanguage('mojolicious', hljsGrammar);
  })();/*! `nginx` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Nginx config
  Author: Peter Leonov <gojpeg@yandex.ru>
  Contributors: Ivan Sagalaev <maniac@softwaremaniacs.org>
  Category: config, web
  Website: https://www.nginx.com
  */

  /** @type LanguageFn */
  function nginx(hljs) {
    const regex = hljs.regex;
    const VAR = {
      className: 'variable',
      variants: [
        { begin: /\$\d+/ },
        { begin: /\$\{\w+\}/ },
        { begin: regex.concat(/[$@]/, hljs.UNDERSCORE_IDENT_RE) }
      ]
    };
    const LITERALS = [
      "on",
      "off",
      "yes",
      "no",
      "true",
      "false",
      "none",
      "blocked",
      "debug",
      "info",
      "notice",
      "warn",
      "error",
      "crit",
      "select",
      "break",
      "last",
      "permanent",
      "redirect",
      "kqueue",
      "rtsig",
      "epoll",
      "poll",
      "/dev/poll"
    ];
    const DEFAULT = {
      endsWithParent: true,
      keywords: {
        $pattern: /[a-z_]{2,}|\/dev\/poll/,
        literal: LITERALS
      },
      relevance: 0,
      illegal: '=>',
      contains: [
        hljs.HASH_COMMENT_MODE,
        {
          className: 'string',
          contains: [
            hljs.BACKSLASH_ESCAPE,
            VAR
          ],
          variants: [
            {
              begin: /"/,
              end: /"/
            },
            {
              begin: /'/,
              end: /'/
            }
          ]
        },
        // this swallows entire URLs to avoid detecting numbers within
        {
          begin: '([a-z]+):/',
          end: '\\s',
          endsWithParent: true,
          excludeEnd: true,
          contains: [ VAR ]
        },
        {
          className: 'regexp',
          contains: [
            hljs.BACKSLASH_ESCAPE,
            VAR
          ],
          variants: [
            {
              begin: "\\s\\^",
              end: "\\s|\\{|;",
              returnEnd: true
            },
            // regexp locations (~, ~*)
            {
              begin: "~\\*?\\s+",
              end: "\\s|\\{|;",
              returnEnd: true
            },
            // *.example.com
            { begin: "\\*(\\.[a-z\\-]+)+" },
            // sub.example.*
            { begin: "([a-z\\-]+\\.)+\\*" }
          ]
        },
        // IP
        {
          className: 'number',
          begin: '\\b\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}(:\\d{1,5})?\\b'
        },
        // units
        {
          className: 'number',
          begin: '\\b\\d+[kKmMgGdshdwy]?\\b',
          relevance: 0
        },
        VAR
      ]
    };

    return {
      name: 'Nginx config',
      aliases: [ 'nginxconf' ],
      contains: [
        hljs.HASH_COMMENT_MODE,
        {
          beginKeywords: "upstream location",
          end: /;|\{/,
          contains: DEFAULT.contains,
          keywords: { section: "upstream location" }
        },
        {
          className: 'section',
          begin: regex.concat(hljs.UNDERSCORE_IDENT_RE + regex.lookahead(/\s+\{/)),
          relevance: 0
        },
        {
          begin: regex.lookahead(hljs.UNDERSCORE_IDENT_RE + '\\s'),
          end: ';|\\{',
          contains: [
            {
              className: 'attribute',
              begin: hljs.UNDERSCORE_IDENT_RE,
              starts: DEFAULT
            }
          ],
          relevance: 0
        }
      ],
      illegal: '[^\\s\\}\\{]'
    };
  }

  return nginx;

})();

    hljs.registerLanguage('nginx', hljsGrammar);
  })();/*! `objectivec` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Objective-C
  Author: Valerii Hiora <valerii.hiora@gmail.com>
  Contributors: Angel G. Olloqui <angelgarcia.mail@gmail.com>, Matt Diephouse <matt@diephouse.com>, Andrew Farmer <ahfarmer@gmail.com>, Minh Nguyễn <mxn@1ec5.org>
  Website: https://developer.apple.com/documentation/objectivec
  Category: common
  */

  function objectivec(hljs) {
    const API_CLASS = {
      className: 'built_in',
      begin: '\\b(AV|CA|CF|CG|CI|CL|CM|CN|CT|MK|MP|MTK|MTL|NS|SCN|SK|UI|WK|XC)\\w+'
    };
    const IDENTIFIER_RE = /[a-zA-Z@][a-zA-Z0-9_]*/;
    const TYPES = [
      "int",
      "float",
      "char",
      "unsigned",
      "signed",
      "short",
      "long",
      "double",
      "wchar_t",
      "unichar",
      "void",
      "bool",
      "BOOL",
      "id|0",
      "_Bool"
    ];
    const KWS = [
      "while",
      "export",
      "sizeof",
      "typedef",
      "const",
      "struct",
      "for",
      "union",
      "volatile",
      "static",
      "mutable",
      "if",
      "do",
      "return",
      "goto",
      "enum",
      "else",
      "break",
      "extern",
      "asm",
      "case",
      "default",
      "register",
      "explicit",
      "typename",
      "switch",
      "continue",
      "inline",
      "readonly",
      "assign",
      "readwrite",
      "self",
      "@synchronized",
      "id",
      "typeof",
      "nonatomic",
      "IBOutlet",
      "IBAction",
      "strong",
      "weak",
      "copy",
      "in",
      "out",
      "inout",
      "bycopy",
      "byref",
      "oneway",
      "__strong",
      "__weak",
      "__block",
      "__autoreleasing",
      "@private",
      "@protected",
      "@public",
      "@try",
      "@property",
      "@end",
      "@throw",
      "@catch",
      "@finally",
      "@autoreleasepool",
      "@synthesize",
      "@dynamic",
      "@selector",
      "@optional",
      "@required",
      "@encode",
      "@package",
      "@import",
      "@defs",
      "@compatibility_alias",
      "__bridge",
      "__bridge_transfer",
      "__bridge_retained",
      "__bridge_retain",
      "__covariant",
      "__contravariant",
      "__kindof",
      "_Nonnull",
      "_Nullable",
      "_Null_unspecified",
      "__FUNCTION__",
      "__PRETTY_FUNCTION__",
      "__attribute__",
      "getter",
      "setter",
      "retain",
      "unsafe_unretained",
      "nonnull",
      "nullable",
      "null_unspecified",
      "null_resettable",
      "class",
      "instancetype",
      "NS_DESIGNATED_INITIALIZER",
      "NS_UNAVAILABLE",
      "NS_REQUIRES_SUPER",
      "NS_RETURNS_INNER_POINTER",
      "NS_INLINE",
      "NS_AVAILABLE",
      "NS_DEPRECATED",
      "NS_ENUM",
      "NS_OPTIONS",
      "NS_SWIFT_UNAVAILABLE",
      "NS_ASSUME_NONNULL_BEGIN",
      "NS_ASSUME_NONNULL_END",
      "NS_REFINED_FOR_SWIFT",
      "NS_SWIFT_NAME",
      "NS_SWIFT_NOTHROW",
      "NS_DURING",
      "NS_HANDLER",
      "NS_ENDHANDLER",
      "NS_VALUERETURN",
      "NS_VOIDRETURN"
    ];
    const LITERALS = [
      "false",
      "true",
      "FALSE",
      "TRUE",
      "nil",
      "YES",
      "NO",
      "NULL"
    ];
    const BUILT_INS = [
      "dispatch_once_t",
      "dispatch_queue_t",
      "dispatch_sync",
      "dispatch_async",
      "dispatch_once"
    ];
    const KEYWORDS = {
      "variable.language": [
        "this",
        "super"
      ],
      $pattern: IDENTIFIER_RE,
      keyword: KWS,
      literal: LITERALS,
      built_in: BUILT_INS,
      type: TYPES
    };
    const CLASS_KEYWORDS = {
      $pattern: IDENTIFIER_RE,
      keyword: [
        "@interface",
        "@class",
        "@protocol",
        "@implementation"
      ]
    };
    return {
      name: 'Objective-C',
      aliases: [
        'mm',
        'objc',
        'obj-c',
        'obj-c++',
        'objective-c++'
      ],
      keywords: KEYWORDS,
      illegal: '</',
      contains: [
        API_CLASS,
        hljs.C_LINE_COMMENT_MODE,
        hljs.C_BLOCK_COMMENT_MODE,
        hljs.C_NUMBER_MODE,
        hljs.QUOTE_STRING_MODE,
        hljs.APOS_STRING_MODE,
        {
          className: 'string',
          variants: [
            {
              begin: '@"',
              end: '"',
              illegal: '\\n',
              contains: [ hljs.BACKSLASH_ESCAPE ]
            }
          ]
        },
        {
          className: 'meta',
          begin: /#\s*[a-z]+\b/,
          end: /$/,
          keywords: { keyword:
              'if else elif endif define undef warning error line '
              + 'pragma ifdef ifndef include' },
          contains: [
            {
              begin: /\\\n/,
              relevance: 0
            },
            hljs.inherit(hljs.QUOTE_STRING_MODE, { className: 'string' }),
            {
              className: 'string',
              begin: /<.*?>/,
              end: /$/,
              illegal: '\\n'
            },
            hljs.C_LINE_COMMENT_MODE,
            hljs.C_BLOCK_COMMENT_MODE
          ]
        },
        {
          className: 'class',
          begin: '(' + CLASS_KEYWORDS.keyword.join('|') + ')\\b',
          end: /(\{|$)/,
          excludeEnd: true,
          keywords: CLASS_KEYWORDS,
          contains: [ hljs.UNDERSCORE_TITLE_MODE ]
        },
        {
          begin: '\\.' + hljs.UNDERSCORE_IDENT_RE,
          relevance: 0
        }
      ]
    };
  }

  return objectivec;

})();

    hljs.registerLanguage('objectivec', hljsGrammar);
  })();/*! `ocaml` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: OCaml
  Author: Mehdi Dogguy <mehdi@dogguy.org>
  Contributors: Nicolas Braud-Santoni <nicolas.braud-santoni@ens-cachan.fr>, Mickael Delahaye <mickael.delahaye@gmail.com>
  Description: OCaml language definition.
  Website: https://ocaml.org
  Category: functional
  */

  function ocaml(hljs) {
    /* missing support for heredoc-like string (OCaml 4.0.2+) */
    return {
      name: 'OCaml',
      aliases: [ 'ml' ],
      keywords: {
        $pattern: '[a-z_]\\w*!?',
        keyword:
          'and as assert asr begin class constraint do done downto else end '
          + 'exception external for fun function functor if in include '
          + 'inherit! inherit initializer land lazy let lor lsl lsr lxor match method!|10 method '
          + 'mod module mutable new object of open! open or private rec sig struct '
          + 'then to try type val! val virtual when while with '
          /* camlp4 */
          + 'parser value',
        built_in:
          /* built-in types */
          'array bool bytes char exn|5 float int int32 int64 list lazy_t|5 nativeint|5 string unit '
          /* (some) types in Pervasives */
          + 'in_channel out_channel ref',
        literal:
          'true false'
      },
      illegal: /\/\/|>>/,
      contains: [
        {
          className: 'literal',
          begin: '\\[(\\|\\|)?\\]|\\(\\)',
          relevance: 0
        },
        hljs.COMMENT(
          '\\(\\*',
          '\\*\\)',
          { contains: [ 'self' ] }
        ),
        { /* type variable */
          className: 'symbol',
          begin: '\'[A-Za-z_](?!\')[\\w\']*'
          /* the grammar is ambiguous on how 'a'b should be interpreted but not the compiler */
        },
        { /* polymorphic variant */
          className: 'type',
          begin: '`[A-Z][\\w\']*'
        },
        { /* module or constructor */
          className: 'type',
          begin: '\\b[A-Z][\\w\']*',
          relevance: 0
        },
        { /* don't color identifiers, but safely catch all identifiers with ' */
          begin: '[a-z_]\\w*\'[\\w\']*',
          relevance: 0
        },
        hljs.inherit(hljs.APOS_STRING_MODE, {
          className: 'string',
          relevance: 0
        }),
        hljs.inherit(hljs.QUOTE_STRING_MODE, { illegal: null }),
        {
          className: 'number',
          begin:
            '\\b(0[xX][a-fA-F0-9_]+[Lln]?|'
            + '0[oO][0-7_]+[Lln]?|'
            + '0[bB][01_]+[Lln]?|'
            + '[0-9][0-9_]*([Lln]|(\\.[0-9_]*)?([eE][-+]?[0-9_]+)?)?)',
          relevance: 0
        },
        { begin: /->/ // relevance booster
        }
      ]
    };
  }

  return ocaml;

})();

    hljs.registerLanguage('ocaml', hljsGrammar);
  })();/*! `perl` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Perl
  Author: Peter Leonov <gojpeg@yandex.ru>
  Website: https://www.perl.org
  Category: common
  */

  /** @type LanguageFn */
  function perl(hljs) {
    const regex = hljs.regex;
    const KEYWORDS = [
      'abs',
      'accept',
      'alarm',
      'and',
      'atan2',
      'bind',
      'binmode',
      'bless',
      'break',
      'caller',
      'chdir',
      'chmod',
      'chomp',
      'chop',
      'chown',
      'chr',
      'chroot',
      'class',
      'close',
      'closedir',
      'connect',
      'continue',
      'cos',
      'crypt',
      'dbmclose',
      'dbmopen',
      'defined',
      'delete',
      'die',
      'do',
      'dump',
      'each',
      'else',
      'elsif',
      'endgrent',
      'endhostent',
      'endnetent',
      'endprotoent',
      'endpwent',
      'endservent',
      'eof',
      'eval',
      'exec',
      'exists',
      'exit',
      'exp',
      'fcntl',
      'field',
      'fileno',
      'flock',
      'for',
      'foreach',
      'fork',
      'format',
      'formline',
      'getc',
      'getgrent',
      'getgrgid',
      'getgrnam',
      'gethostbyaddr',
      'gethostbyname',
      'gethostent',
      'getlogin',
      'getnetbyaddr',
      'getnetbyname',
      'getnetent',
      'getpeername',
      'getpgrp',
      'getpriority',
      'getprotobyname',
      'getprotobynumber',
      'getprotoent',
      'getpwent',
      'getpwnam',
      'getpwuid',
      'getservbyname',
      'getservbyport',
      'getservent',
      'getsockname',
      'getsockopt',
      'given',
      'glob',
      'gmtime',
      'goto',
      'grep',
      'gt',
      'hex',
      'if',
      'index',
      'int',
      'ioctl',
      'join',
      'keys',
      'kill',
      'last',
      'lc',
      'lcfirst',
      'length',
      'link',
      'listen',
      'local',
      'localtime',
      'log',
      'lstat',
      'lt',
      'ma',
      'map',
      'method',
      'mkdir',
      'msgctl',
      'msgget',
      'msgrcv',
      'msgsnd',
      'my',
      'ne',
      'next',
      'no',
      'not',
      'oct',
      'open',
      'opendir',
      'or',
      'ord',
      'our',
      'pack',
      'package',
      'pipe',
      'pop',
      'pos',
      'print',
      'printf',
      'prototype',
      'push',
      'q|0',
      'qq',
      'quotemeta',
      'qw',
      'qx',
      'rand',
      'read',
      'readdir',
      'readline',
      'readlink',
      'readpipe',
      'recv',
      'redo',
      'ref',
      'rename',
      'require',
      'reset',
      'return',
      'reverse',
      'rewinddir',
      'rindex',
      'rmdir',
      'say',
      'scalar',
      'seek',
      'seekdir',
      'select',
      'semctl',
      'semget',
      'semop',
      'send',
      'setgrent',
      'sethostent',
      'setnetent',
      'setpgrp',
      'setpriority',
      'setprotoent',
      'setpwent',
      'setservent',
      'setsockopt',
      'shift',
      'shmctl',
      'shmget',
      'shmread',
      'shmwrite',
      'shutdown',
      'sin',
      'sleep',
      'socket',
      'socketpair',
      'sort',
      'splice',
      'split',
      'sprintf',
      'sqrt',
      'srand',
      'stat',
      'state',
      'study',
      'sub',
      'substr',
      'symlink',
      'syscall',
      'sysopen',
      'sysread',
      'sysseek',
      'system',
      'syswrite',
      'tell',
      'telldir',
      'tie',
      'tied',
      'time',
      'times',
      'tr',
      'truncate',
      'uc',
      'ucfirst',
      'umask',
      'undef',
      'unless',
      'unlink',
      'unpack',
      'unshift',
      'untie',
      'until',
      'use',
      'utime',
      'values',
      'vec',
      'wait',
      'waitpid',
      'wantarray',
      'warn',
      'when',
      'while',
      'write',
      'x|0',
      'xor',
      'y|0'
    ];

    // https://perldoc.perl.org/perlre#Modifiers
    const REGEX_MODIFIERS = /[dualxmsipngr]{0,12}/; // aa and xx are valid, making max length 12
    const PERL_KEYWORDS = {
      $pattern: /[\w.]+/,
      keyword: KEYWORDS.join(" ")
    };
    const SUBST = {
      className: 'subst',
      begin: '[$@]\\{',
      end: '\\}',
      keywords: PERL_KEYWORDS
    };
    const METHOD = {
      begin: /->\{/,
      end: /\}/
      // contains defined later
    };
    const ATTR = {
      scope: 'attr',
      match: /\s+:\s*\w+(\s*\(.*?\))?/,
    };
    const VAR = {
      scope: 'variable',
      variants: [
        { begin: /\$\d/ },
        { begin: regex.concat(
          /[$%@](?!")(\^\w\b|#\w+(::\w+)*|\{\w+\}|\w+(::\w*)*)/,
          // negative look-ahead tries to avoid matching patterns that are not
          // Perl at all like $ident$, @ident@, etc.
          `(?![A-Za-z])(?![@$%])`
          )
        },
        {
          // Only $= is a special Perl variable and one can't declare @= or %=.
          begin: /[$%@](?!")[^\s\w{=]|\$=/,
          relevance: 0
        }
      ],
      contains: [ ATTR ],
    };
    const NUMBER = {
      className: 'number',
      variants: [
        // decimal numbers:
        // include the case where a number starts with a dot (eg. .9), and
        // the leading 0? avoids mixing the first and second match on 0.x cases
        { match: /0?\.[0-9][0-9_]+\b/ },
        // include the special versioned number (eg. v5.38)
        { match: /\bv?(0|[1-9][0-9_]*(\.[0-9_]+)?|[1-9][0-9_]*)\b/ },
        // non-decimal numbers:
        { match: /\b0[0-7][0-7_]*\b/ },
        { match: /\b0x[0-9a-fA-F][0-9a-fA-F_]*\b/ },
        { match: /\b0b[0-1][0-1_]*\b/ },
      ],
      relevance: 0
    };
    const STRING_CONTAINS = [
      hljs.BACKSLASH_ESCAPE,
      SUBST,
      VAR
    ];
    const REGEX_DELIMS = [
      /!/,
      /\//,
      /\|/,
      /\?/,
      /'/,
      /"/, // valid but infrequent and weird
      /#/ // valid but infrequent and weird
    ];
    /**
     * @param {string|RegExp} prefix
     * @param {string|RegExp} open
     * @param {string|RegExp} close
     */
    const PAIRED_DOUBLE_RE = (prefix, open, close = '\\1') => {
      const middle = (close === '\\1')
        ? close
        : regex.concat(close, open);
      return regex.concat(
        regex.concat("(?:", prefix, ")"),
        open,
        /(?:\\.|[^\\\/])*?/,
        middle,
        /(?:\\.|[^\\\/])*?/,
        close,
        REGEX_MODIFIERS
      );
    };
    /**
     * @param {string|RegExp} prefix
     * @param {string|RegExp} open
     * @param {string|RegExp} close
     */
    const PAIRED_RE = (prefix, open, close) => {
      return regex.concat(
        regex.concat("(?:", prefix, ")"),
        open,
        /(?:\\.|[^\\\/])*?/,
        close,
        REGEX_MODIFIERS
      );
    };
    const PERL_DEFAULT_CONTAINS = [
      VAR,
      hljs.HASH_COMMENT_MODE,
      hljs.COMMENT(
        /^=\w/,
        /=cut/,
        { endsWithParent: true }
      ),
      METHOD,
      {
        className: 'string',
        contains: STRING_CONTAINS,
        variants: [
          {
            begin: 'q[qwxr]?\\s*\\(',
            end: '\\)',
            relevance: 5
          },
          {
            begin: 'q[qwxr]?\\s*\\[',
            end: '\\]',
            relevance: 5
          },
          {
            begin: 'q[qwxr]?\\s*\\{',
            end: '\\}',
            relevance: 5
          },
          {
            begin: 'q[qwxr]?\\s*\\|',
            end: '\\|',
            relevance: 5
          },
          {
            begin: 'q[qwxr]?\\s*<',
            end: '>',
            relevance: 5
          },
          {
            begin: 'qw\\s+q',
            end: 'q',
            relevance: 5
          },
          {
            begin: '\'',
            end: '\'',
            contains: [ hljs.BACKSLASH_ESCAPE ]
          },
          {
            begin: '"',
            end: '"'
          },
          {
            begin: '`',
            end: '`',
            contains: [ hljs.BACKSLASH_ESCAPE ]
          },
          {
            begin: /\{\w+\}/,
            relevance: 0
          },
          {
            begin: '-?\\w+\\s*=>',
            relevance: 0
          }
        ]
      },
      NUMBER,
      { // regexp container
        begin: '(\\/\\/|' + hljs.RE_STARTERS_RE + '|\\b(split|return|print|reverse|grep)\\b)\\s*',
        keywords: 'split return print reverse grep',
        relevance: 0,
        contains: [
          hljs.HASH_COMMENT_MODE,
          {
            className: 'regexp',
            variants: [
              // allow matching common delimiters
              { begin: PAIRED_DOUBLE_RE("s|tr|y", regex.either(...REGEX_DELIMS, { capture: true })) },
              // and then paired delmis
              { begin: PAIRED_DOUBLE_RE("s|tr|y", "\\(", "\\)") },
              { begin: PAIRED_DOUBLE_RE("s|tr|y", "\\[", "\\]") },
              { begin: PAIRED_DOUBLE_RE("s|tr|y", "\\{", "\\}") }
            ],
            relevance: 2
          },
          {
            className: 'regexp',
            variants: [
              {
                // could be a comment in many languages so do not count
                // as relevant
                begin: /(m|qr)\/\//,
                relevance: 0
              },
              // prefix is optional with /regex/
              { begin: PAIRED_RE("(?:m|qr)?", /\//, /\//) },
              // allow matching common delimiters
              { begin: PAIRED_RE("m|qr", regex.either(...REGEX_DELIMS, { capture: true }), /\1/) },
              // allow common paired delmins
              { begin: PAIRED_RE("m|qr", /\(/, /\)/) },
              { begin: PAIRED_RE("m|qr", /\[/, /\]/) },
              { begin: PAIRED_RE("m|qr", /\{/, /\}/) }
            ]
          }
        ]
      },
      {
        className: 'function',
        beginKeywords: 'sub method',
        end: '(\\s*\\(.*?\\))?[;{]',
        excludeEnd: true,
        relevance: 5,
        contains: [ hljs.TITLE_MODE, ATTR ]
      },
      {
        className: 'class',
        beginKeywords: 'class',
        end: '[;{]',
        excludeEnd: true,
        relevance: 5,
        contains: [ hljs.TITLE_MODE, ATTR, NUMBER ]
      },
      {
        begin: '-\\w\\b',
        relevance: 0
      },
      {
        begin: "^__DATA__$",
        end: "^__END__$",
        subLanguage: 'mojolicious',
        contains: [
          {
            begin: "^@@.*",
            end: "$",
            className: "comment"
          }
        ]
      }
    ];
    SUBST.contains = PERL_DEFAULT_CONTAINS;
    METHOD.contains = PERL_DEFAULT_CONTAINS;

    return {
      name: 'Perl',
      aliases: [
        'pl',
        'pm'
      ],
      keywords: PERL_KEYWORDS,
      contains: PERL_DEFAULT_CONTAINS
    };
  }

  return perl;

})();

    hljs.registerLanguage('perl', hljsGrammar);
  })();/*! `pgsql` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: PostgreSQL and PL/pgSQL
  Author: Egor Rogov (e.rogov@postgrespro.ru)
  Website: https://www.postgresql.org/docs/11/sql.html
  Description:
      This language incorporates both PostgreSQL SQL dialect and PL/pgSQL language.
      It is based on PostgreSQL version 11. Some notes:
      - Text in double-dollar-strings is _always_ interpreted as some programming code. Text
        in ordinary quotes is _never_ interpreted that way and highlighted just as a string.
      - There are quite a bit "special cases". That's because many keywords are not strictly
        they are keywords in some contexts and ordinary identifiers in others. Only some
        of such cases are handled; you still can get some of your identifiers highlighted
        wrong way.
      - Function names deliberately are not highlighted. There is no way to tell function
        call from other constructs, hence we can't highlight _all_ function names. And
        some names highlighted while others not looks ugly.
  Category: database
  */

  function pgsql(hljs) {
    const COMMENT_MODE = hljs.COMMENT('--', '$');
    const UNQUOTED_IDENT = '[a-zA-Z_][a-zA-Z_0-9$]*';
    const DOLLAR_STRING = '\\$([a-zA-Z_]?|[a-zA-Z_][a-zA-Z_0-9]*)\\$';
    const LABEL = '<<\\s*' + UNQUOTED_IDENT + '\\s*>>';

    const SQL_KW =
      // https://www.postgresql.org/docs/11/static/sql-keywords-appendix.html
      // https://www.postgresql.org/docs/11/static/sql-commands.html
      // SQL commands (starting words)
      'ABORT ALTER ANALYZE BEGIN CALL CHECKPOINT|10 CLOSE CLUSTER COMMENT COMMIT COPY CREATE DEALLOCATE DECLARE '
      + 'DELETE DISCARD DO DROP END EXECUTE EXPLAIN FETCH GRANT IMPORT INSERT LISTEN LOAD LOCK MOVE NOTIFY '
      + 'PREPARE REASSIGN|10 REFRESH REINDEX RELEASE RESET REVOKE ROLLBACK SAVEPOINT SECURITY SELECT SET SHOW '
      + 'START TRUNCATE UNLISTEN|10 UPDATE VACUUM|10 VALUES '
      // SQL commands (others)
      + 'AGGREGATE COLLATION CONVERSION|10 DATABASE DEFAULT PRIVILEGES DOMAIN TRIGGER EXTENSION FOREIGN '
      + 'WRAPPER|10 TABLE FUNCTION GROUP LANGUAGE LARGE OBJECT MATERIALIZED VIEW OPERATOR CLASS '
      + 'FAMILY POLICY PUBLICATION|10 ROLE RULE SCHEMA SEQUENCE SERVER STATISTICS SUBSCRIPTION SYSTEM '
      + 'TABLESPACE CONFIGURATION DICTIONARY PARSER TEMPLATE TYPE USER MAPPING PREPARED ACCESS '
      + 'METHOD CAST AS TRANSFORM TRANSACTION OWNED TO INTO SESSION AUTHORIZATION '
      + 'INDEX PROCEDURE ASSERTION '
      // additional reserved key words
      + 'ALL ANALYSE AND ANY ARRAY ASC ASYMMETRIC|10 BOTH CASE CHECK '
      + 'COLLATE COLUMN CONCURRENTLY|10 CONSTRAINT CROSS '
      + 'DEFERRABLE RANGE '
      + 'DESC DISTINCT ELSE EXCEPT FOR FREEZE|10 FROM FULL HAVING '
      + 'ILIKE IN INITIALLY INNER INTERSECT IS ISNULL JOIN LATERAL LEADING LIKE LIMIT '
      + 'NATURAL NOT NOTNULL NULL OFFSET ON ONLY OR ORDER OUTER OVERLAPS PLACING PRIMARY '
      + 'REFERENCES RETURNING SIMILAR SOME SYMMETRIC TABLESAMPLE THEN '
      + 'TRAILING UNION UNIQUE USING VARIADIC|10 VERBOSE WHEN WHERE WINDOW WITH '
      // some of non-reserved (which are used in clauses or as PL/pgSQL keyword)
      + 'BY RETURNS INOUT OUT SETOF|10 IF STRICT CURRENT CONTINUE OWNER LOCATION OVER PARTITION WITHIN '
      + 'BETWEEN ESCAPE EXTERNAL INVOKER DEFINER WORK RENAME VERSION CONNECTION CONNECT '
      + 'TABLES TEMP TEMPORARY FUNCTIONS SEQUENCES TYPES SCHEMAS OPTION CASCADE RESTRICT ADD ADMIN '
      + 'EXISTS VALID VALIDATE ENABLE DISABLE REPLICA|10 ALWAYS PASSING COLUMNS PATH '
      + 'REF VALUE OVERRIDING IMMUTABLE STABLE VOLATILE BEFORE AFTER EACH ROW PROCEDURAL '
      + 'ROUTINE NO HANDLER VALIDATOR OPTIONS STORAGE OIDS|10 WITHOUT INHERIT DEPENDS CALLED '
      + 'INPUT LEAKPROOF|10 COST ROWS NOWAIT SEARCH UNTIL ENCRYPTED|10 PASSWORD CONFLICT|10 '
      + 'INSTEAD INHERITS CHARACTERISTICS WRITE CURSOR ALSO STATEMENT SHARE EXCLUSIVE INLINE '
      + 'ISOLATION REPEATABLE READ COMMITTED SERIALIZABLE UNCOMMITTED LOCAL GLOBAL SQL PROCEDURES '
      + 'RECURSIVE SNAPSHOT ROLLUP CUBE TRUSTED|10 INCLUDE FOLLOWING PRECEDING UNBOUNDED RANGE GROUPS '
      + 'UNENCRYPTED|10 SYSID FORMAT DELIMITER HEADER QUOTE ENCODING FILTER OFF '
      // some parameters of VACUUM/ANALYZE/EXPLAIN
      + 'FORCE_QUOTE FORCE_NOT_NULL FORCE_NULL COSTS BUFFERS TIMING SUMMARY DISABLE_PAGE_SKIPPING '
      //
      + 'RESTART CYCLE GENERATED IDENTITY DEFERRED IMMEDIATE LEVEL LOGGED UNLOGGED '
      + 'OF NOTHING NONE EXCLUDE ATTRIBUTE '
      // from GRANT (not keywords actually)
      + 'USAGE ROUTINES '
      // actually literals, but look better this way (due to IS TRUE, IS FALSE, ISNULL etc)
      + 'TRUE FALSE NAN INFINITY ';

    const ROLE_ATTRS = // only those not in keywrods already
      'SUPERUSER NOSUPERUSER CREATEDB NOCREATEDB CREATEROLE NOCREATEROLE INHERIT NOINHERIT '
      + 'LOGIN NOLOGIN REPLICATION NOREPLICATION BYPASSRLS NOBYPASSRLS ';

    const PLPGSQL_KW =
      'ALIAS BEGIN CONSTANT DECLARE END EXCEPTION RETURN PERFORM|10 RAISE GET DIAGNOSTICS '
      + 'STACKED|10 FOREACH LOOP ELSIF EXIT WHILE REVERSE SLICE DEBUG LOG INFO NOTICE WARNING ASSERT '
      + 'OPEN ';

    const TYPES =
      // https://www.postgresql.org/docs/11/static/datatype.html
      'BIGINT INT8 BIGSERIAL SERIAL8 BIT VARYING VARBIT BOOLEAN BOOL BOX BYTEA CHARACTER CHAR VARCHAR '
      + 'CIDR CIRCLE DATE DOUBLE PRECISION FLOAT8 FLOAT INET INTEGER INT INT4 INTERVAL JSON JSONB LINE LSEG|10 '
      + 'MACADDR MACADDR8 MONEY NUMERIC DEC DECIMAL PATH POINT POLYGON REAL FLOAT4 SMALLINT INT2 '
      + 'SMALLSERIAL|10 SERIAL2|10 SERIAL|10 SERIAL4|10 TEXT TIME ZONE TIMETZ|10 TIMESTAMP TIMESTAMPTZ|10 TSQUERY|10 TSVECTOR|10 '
      + 'TXID_SNAPSHOT|10 UUID XML NATIONAL NCHAR '
      + 'INT4RANGE|10 INT8RANGE|10 NUMRANGE|10 TSRANGE|10 TSTZRANGE|10 DATERANGE|10 '
      // pseudotypes
      + 'ANYELEMENT ANYARRAY ANYNONARRAY ANYENUM ANYRANGE CSTRING INTERNAL '
      + 'RECORD PG_DDL_COMMAND VOID UNKNOWN OPAQUE REFCURSOR '
      // spec. type
      + 'NAME '
      // OID-types
      + 'OID REGPROC|10 REGPROCEDURE|10 REGOPER|10 REGOPERATOR|10 REGCLASS|10 REGTYPE|10 REGROLE|10 '
      + 'REGNAMESPACE|10 REGCONFIG|10 REGDICTIONARY|10 ';// +

    const TYPES_RE =
      TYPES.trim()
        .split(' ')
        .map(function(val) { return val.split('|')[0]; })
        .join('|');

    const SQL_BI =
      'CURRENT_TIME CURRENT_TIMESTAMP CURRENT_USER CURRENT_CATALOG|10 CURRENT_DATE LOCALTIME LOCALTIMESTAMP '
      + 'CURRENT_ROLE|10 CURRENT_SCHEMA|10 SESSION_USER PUBLIC ';

    const PLPGSQL_BI =
      'FOUND NEW OLD TG_NAME|10 TG_WHEN|10 TG_LEVEL|10 TG_OP|10 TG_RELID|10 TG_RELNAME|10 '
      + 'TG_TABLE_NAME|10 TG_TABLE_SCHEMA|10 TG_NARGS|10 TG_ARGV|10 TG_EVENT|10 TG_TAG|10 '
      // get diagnostics
      + 'ROW_COUNT RESULT_OID|10 PG_CONTEXT|10 RETURNED_SQLSTATE COLUMN_NAME CONSTRAINT_NAME '
      + 'PG_DATATYPE_NAME|10 MESSAGE_TEXT TABLE_NAME SCHEMA_NAME PG_EXCEPTION_DETAIL|10 '
      + 'PG_EXCEPTION_HINT|10 PG_EXCEPTION_CONTEXT|10 ';

    const PLPGSQL_EXCEPTIONS =
      // exceptions https://www.postgresql.org/docs/current/static/errcodes-appendix.html
      'SQLSTATE SQLERRM|10 '
      + 'SUCCESSFUL_COMPLETION WARNING DYNAMIC_RESULT_SETS_RETURNED IMPLICIT_ZERO_BIT_PADDING '
      + 'NULL_VALUE_ELIMINATED_IN_SET_FUNCTION PRIVILEGE_NOT_GRANTED PRIVILEGE_NOT_REVOKED '
      + 'STRING_DATA_RIGHT_TRUNCATION DEPRECATED_FEATURE NO_DATA NO_ADDITIONAL_DYNAMIC_RESULT_SETS_RETURNED '
      + 'SQL_STATEMENT_NOT_YET_COMPLETE CONNECTION_EXCEPTION CONNECTION_DOES_NOT_EXIST CONNECTION_FAILURE '
      + 'SQLCLIENT_UNABLE_TO_ESTABLISH_SQLCONNECTION SQLSERVER_REJECTED_ESTABLISHMENT_OF_SQLCONNECTION '
      + 'TRANSACTION_RESOLUTION_UNKNOWN PROTOCOL_VIOLATION TRIGGERED_ACTION_EXCEPTION FEATURE_NOT_SUPPORTED '
      + 'INVALID_TRANSACTION_INITIATION LOCATOR_EXCEPTION INVALID_LOCATOR_SPECIFICATION INVALID_GRANTOR '
      + 'INVALID_GRANT_OPERATION INVALID_ROLE_SPECIFICATION DIAGNOSTICS_EXCEPTION '
      + 'STACKED_DIAGNOSTICS_ACCESSED_WITHOUT_ACTIVE_HANDLER CASE_NOT_FOUND CARDINALITY_VIOLATION '
      + 'DATA_EXCEPTION ARRAY_SUBSCRIPT_ERROR CHARACTER_NOT_IN_REPERTOIRE DATETIME_FIELD_OVERFLOW '
      + 'DIVISION_BY_ZERO ERROR_IN_ASSIGNMENT ESCAPE_CHARACTER_CONFLICT INDICATOR_OVERFLOW '
      + 'INTERVAL_FIELD_OVERFLOW INVALID_ARGUMENT_FOR_LOGARITHM INVALID_ARGUMENT_FOR_NTILE_FUNCTION '
      + 'INVALID_ARGUMENT_FOR_NTH_VALUE_FUNCTION INVALID_ARGUMENT_FOR_POWER_FUNCTION '
      + 'INVALID_ARGUMENT_FOR_WIDTH_BUCKET_FUNCTION INVALID_CHARACTER_VALUE_FOR_CAST '
      + 'INVALID_DATETIME_FORMAT INVALID_ESCAPE_CHARACTER INVALID_ESCAPE_OCTET INVALID_ESCAPE_SEQUENCE '
      + 'NONSTANDARD_USE_OF_ESCAPE_CHARACTER INVALID_INDICATOR_PARAMETER_VALUE INVALID_PARAMETER_VALUE '
      + 'INVALID_REGULAR_EXPRESSION INVALID_ROW_COUNT_IN_LIMIT_CLAUSE '
      + 'INVALID_ROW_COUNT_IN_RESULT_OFFSET_CLAUSE INVALID_TABLESAMPLE_ARGUMENT INVALID_TABLESAMPLE_REPEAT '
      + 'INVALID_TIME_ZONE_DISPLACEMENT_VALUE INVALID_USE_OF_ESCAPE_CHARACTER MOST_SPECIFIC_TYPE_MISMATCH '
      + 'NULL_VALUE_NOT_ALLOWED NULL_VALUE_NO_INDICATOR_PARAMETER NUMERIC_VALUE_OUT_OF_RANGE '
      + 'SEQUENCE_GENERATOR_LIMIT_EXCEEDED STRING_DATA_LENGTH_MISMATCH STRING_DATA_RIGHT_TRUNCATION '
      + 'SUBSTRING_ERROR TRIM_ERROR UNTERMINATED_C_STRING ZERO_LENGTH_CHARACTER_STRING '
      + 'FLOATING_POINT_EXCEPTION INVALID_TEXT_REPRESENTATION INVALID_BINARY_REPRESENTATION '
      + 'BAD_COPY_FILE_FORMAT UNTRANSLATABLE_CHARACTER NOT_AN_XML_DOCUMENT INVALID_XML_DOCUMENT '
      + 'INVALID_XML_CONTENT INVALID_XML_COMMENT INVALID_XML_PROCESSING_INSTRUCTION '
      + 'INTEGRITY_CONSTRAINT_VIOLATION RESTRICT_VIOLATION NOT_NULL_VIOLATION FOREIGN_KEY_VIOLATION '
      + 'UNIQUE_VIOLATION CHECK_VIOLATION EXCLUSION_VIOLATION INVALID_CURSOR_STATE '
      + 'INVALID_TRANSACTION_STATE ACTIVE_SQL_TRANSACTION BRANCH_TRANSACTION_ALREADY_ACTIVE '
      + 'HELD_CURSOR_REQUIRES_SAME_ISOLATION_LEVEL INAPPROPRIATE_ACCESS_MODE_FOR_BRANCH_TRANSACTION '
      + 'INAPPROPRIATE_ISOLATION_LEVEL_FOR_BRANCH_TRANSACTION '
      + 'NO_ACTIVE_SQL_TRANSACTION_FOR_BRANCH_TRANSACTION READ_ONLY_SQL_TRANSACTION '
      + 'SCHEMA_AND_DATA_STATEMENT_MIXING_NOT_SUPPORTED NO_ACTIVE_SQL_TRANSACTION '
      + 'IN_FAILED_SQL_TRANSACTION IDLE_IN_TRANSACTION_SESSION_TIMEOUT INVALID_SQL_STATEMENT_NAME '
      + 'TRIGGERED_DATA_CHANGE_VIOLATION INVALID_AUTHORIZATION_SPECIFICATION INVALID_PASSWORD '
      + 'DEPENDENT_PRIVILEGE_DESCRIPTORS_STILL_EXIST DEPENDENT_OBJECTS_STILL_EXIST '
      + 'INVALID_TRANSACTION_TERMINATION SQL_ROUTINE_EXCEPTION FUNCTION_EXECUTED_NO_RETURN_STATEMENT '
      + 'MODIFYING_SQL_DATA_NOT_PERMITTED PROHIBITED_SQL_STATEMENT_ATTEMPTED '
      + 'READING_SQL_DATA_NOT_PERMITTED INVALID_CURSOR_NAME EXTERNAL_ROUTINE_EXCEPTION '
      + 'CONTAINING_SQL_NOT_PERMITTED MODIFYING_SQL_DATA_NOT_PERMITTED '
      + 'PROHIBITED_SQL_STATEMENT_ATTEMPTED READING_SQL_DATA_NOT_PERMITTED '
      + 'EXTERNAL_ROUTINE_INVOCATION_EXCEPTION INVALID_SQLSTATE_RETURNED NULL_VALUE_NOT_ALLOWED '
      + 'TRIGGER_PROTOCOL_VIOLATED SRF_PROTOCOL_VIOLATED EVENT_TRIGGER_PROTOCOL_VIOLATED '
      + 'SAVEPOINT_EXCEPTION INVALID_SAVEPOINT_SPECIFICATION INVALID_CATALOG_NAME '
      + 'INVALID_SCHEMA_NAME TRANSACTION_ROLLBACK TRANSACTION_INTEGRITY_CONSTRAINT_VIOLATION '
      + 'SERIALIZATION_FAILURE STATEMENT_COMPLETION_UNKNOWN DEADLOCK_DETECTED '
      + 'SYNTAX_ERROR_OR_ACCESS_RULE_VIOLATION SYNTAX_ERROR INSUFFICIENT_PRIVILEGE CANNOT_COERCE '
      + 'GROUPING_ERROR WINDOWING_ERROR INVALID_RECURSION INVALID_FOREIGN_KEY INVALID_NAME '
      + 'NAME_TOO_LONG RESERVED_NAME DATATYPE_MISMATCH INDETERMINATE_DATATYPE COLLATION_MISMATCH '
      + 'INDETERMINATE_COLLATION WRONG_OBJECT_TYPE GENERATED_ALWAYS UNDEFINED_COLUMN '
      + 'UNDEFINED_FUNCTION UNDEFINED_TABLE UNDEFINED_PARAMETER UNDEFINED_OBJECT '
      + 'DUPLICATE_COLUMN DUPLICATE_CURSOR DUPLICATE_DATABASE DUPLICATE_FUNCTION '
      + 'DUPLICATE_PREPARED_STATEMENT DUPLICATE_SCHEMA DUPLICATE_TABLE DUPLICATE_ALIAS '
      + 'DUPLICATE_OBJECT AMBIGUOUS_COLUMN AMBIGUOUS_FUNCTION AMBIGUOUS_PARAMETER AMBIGUOUS_ALIAS '
      + 'INVALID_COLUMN_REFERENCE INVALID_COLUMN_DEFINITION INVALID_CURSOR_DEFINITION '
      + 'INVALID_DATABASE_DEFINITION INVALID_FUNCTION_DEFINITION '
      + 'INVALID_PREPARED_STATEMENT_DEFINITION INVALID_SCHEMA_DEFINITION INVALID_TABLE_DEFINITION '
      + 'INVALID_OBJECT_DEFINITION WITH_CHECK_OPTION_VIOLATION INSUFFICIENT_RESOURCES DISK_FULL '
      + 'OUT_OF_MEMORY TOO_MANY_CONNECTIONS CONFIGURATION_LIMIT_EXCEEDED PROGRAM_LIMIT_EXCEEDED '
      + 'STATEMENT_TOO_COMPLEX TOO_MANY_COLUMNS TOO_MANY_ARGUMENTS OBJECT_NOT_IN_PREREQUISITE_STATE '
      + 'OBJECT_IN_USE CANT_CHANGE_RUNTIME_PARAM LOCK_NOT_AVAILABLE OPERATOR_INTERVENTION '
      + 'QUERY_CANCELED ADMIN_SHUTDOWN CRASH_SHUTDOWN CANNOT_CONNECT_NOW DATABASE_DROPPED '
      + 'SYSTEM_ERROR IO_ERROR UNDEFINED_FILE DUPLICATE_FILE SNAPSHOT_TOO_OLD CONFIG_FILE_ERROR '
      + 'LOCK_FILE_EXISTS FDW_ERROR FDW_COLUMN_NAME_NOT_FOUND FDW_DYNAMIC_PARAMETER_VALUE_NEEDED '
      + 'FDW_FUNCTION_SEQUENCE_ERROR FDW_INCONSISTENT_DESCRIPTOR_INFORMATION '
      + 'FDW_INVALID_ATTRIBUTE_VALUE FDW_INVALID_COLUMN_NAME FDW_INVALID_COLUMN_NUMBER '
      + 'FDW_INVALID_DATA_TYPE FDW_INVALID_DATA_TYPE_DESCRIPTORS '
      + 'FDW_INVALID_DESCRIPTOR_FIELD_IDENTIFIER FDW_INVALID_HANDLE FDW_INVALID_OPTION_INDEX '
      + 'FDW_INVALID_OPTION_NAME FDW_INVALID_STRING_LENGTH_OR_BUFFER_LENGTH '
      + 'FDW_INVALID_STRING_FORMAT FDW_INVALID_USE_OF_NULL_POINTER FDW_TOO_MANY_HANDLES '
      + 'FDW_OUT_OF_MEMORY FDW_NO_SCHEMAS FDW_OPTION_NAME_NOT_FOUND FDW_REPLY_HANDLE '
      + 'FDW_SCHEMA_NOT_FOUND FDW_TABLE_NOT_FOUND FDW_UNABLE_TO_CREATE_EXECUTION '
      + 'FDW_UNABLE_TO_CREATE_REPLY FDW_UNABLE_TO_ESTABLISH_CONNECTION PLPGSQL_ERROR '
      + 'RAISE_EXCEPTION NO_DATA_FOUND TOO_MANY_ROWS ASSERT_FAILURE INTERNAL_ERROR DATA_CORRUPTED '
      + 'INDEX_CORRUPTED ';

    const FUNCTIONS =
      // https://www.postgresql.org/docs/11/static/functions-aggregate.html
      'ARRAY_AGG AVG BIT_AND BIT_OR BOOL_AND BOOL_OR COUNT EVERY JSON_AGG JSONB_AGG JSON_OBJECT_AGG '
      + 'JSONB_OBJECT_AGG MAX MIN MODE STRING_AGG SUM XMLAGG '
      + 'CORR COVAR_POP COVAR_SAMP REGR_AVGX REGR_AVGY REGR_COUNT REGR_INTERCEPT REGR_R2 REGR_SLOPE '
      + 'REGR_SXX REGR_SXY REGR_SYY STDDEV STDDEV_POP STDDEV_SAMP VARIANCE VAR_POP VAR_SAMP '
      + 'PERCENTILE_CONT PERCENTILE_DISC '
      // https://www.postgresql.org/docs/11/static/functions-window.html
      + 'ROW_NUMBER RANK DENSE_RANK PERCENT_RANK CUME_DIST NTILE LAG LEAD FIRST_VALUE LAST_VALUE NTH_VALUE '
      // https://www.postgresql.org/docs/11/static/functions-comparison.html
      + 'NUM_NONNULLS NUM_NULLS '
      // https://www.postgresql.org/docs/11/static/functions-math.html
      + 'ABS CBRT CEIL CEILING DEGREES DIV EXP FLOOR LN LOG MOD PI POWER RADIANS ROUND SCALE SIGN SQRT '
      + 'TRUNC WIDTH_BUCKET '
      + 'RANDOM SETSEED '
      + 'ACOS ACOSD ASIN ASIND ATAN ATAND ATAN2 ATAN2D COS COSD COT COTD SIN SIND TAN TAND '
      // https://www.postgresql.org/docs/11/static/functions-string.html
      + 'BIT_LENGTH CHAR_LENGTH CHARACTER_LENGTH LOWER OCTET_LENGTH OVERLAY POSITION SUBSTRING TREAT TRIM UPPER '
      + 'ASCII BTRIM CHR CONCAT CONCAT_WS CONVERT CONVERT_FROM CONVERT_TO DECODE ENCODE INITCAP '
      + 'LEFT LENGTH LPAD LTRIM MD5 PARSE_IDENT PG_CLIENT_ENCODING QUOTE_IDENT|10 QUOTE_LITERAL|10 '
      + 'QUOTE_NULLABLE|10 REGEXP_MATCH REGEXP_MATCHES REGEXP_REPLACE REGEXP_SPLIT_TO_ARRAY '
      + 'REGEXP_SPLIT_TO_TABLE REPEAT REPLACE REVERSE RIGHT RPAD RTRIM SPLIT_PART STRPOS SUBSTR '
      + 'TO_ASCII TO_HEX TRANSLATE '
      // https://www.postgresql.org/docs/11/static/functions-binarystring.html
      + 'OCTET_LENGTH GET_BIT GET_BYTE SET_BIT SET_BYTE '
      // https://www.postgresql.org/docs/11/static/functions-formatting.html
      + 'TO_CHAR TO_DATE TO_NUMBER TO_TIMESTAMP '
      // https://www.postgresql.org/docs/11/static/functions-datetime.html
      + 'AGE CLOCK_TIMESTAMP|10 DATE_PART DATE_TRUNC ISFINITE JUSTIFY_DAYS JUSTIFY_HOURS JUSTIFY_INTERVAL '
      + 'MAKE_DATE MAKE_INTERVAL|10 MAKE_TIME MAKE_TIMESTAMP|10 MAKE_TIMESTAMPTZ|10 NOW STATEMENT_TIMESTAMP|10 '
      + 'TIMEOFDAY TRANSACTION_TIMESTAMP|10 '
      // https://www.postgresql.org/docs/11/static/functions-enum.html
      + 'ENUM_FIRST ENUM_LAST ENUM_RANGE '
      // https://www.postgresql.org/docs/11/static/functions-geometry.html
      + 'AREA CENTER DIAMETER HEIGHT ISCLOSED ISOPEN NPOINTS PCLOSE POPEN RADIUS WIDTH '
      + 'BOX BOUND_BOX CIRCLE LINE LSEG PATH POLYGON '
      // https://www.postgresql.org/docs/11/static/functions-net.html
      + 'ABBREV BROADCAST HOST HOSTMASK MASKLEN NETMASK NETWORK SET_MASKLEN TEXT INET_SAME_FAMILY '
      + 'INET_MERGE MACADDR8_SET7BIT '
      // https://www.postgresql.org/docs/11/static/functions-textsearch.html
      + 'ARRAY_TO_TSVECTOR GET_CURRENT_TS_CONFIG NUMNODE PLAINTO_TSQUERY PHRASETO_TSQUERY WEBSEARCH_TO_TSQUERY '
      + 'QUERYTREE SETWEIGHT STRIP TO_TSQUERY TO_TSVECTOR JSON_TO_TSVECTOR JSONB_TO_TSVECTOR TS_DELETE '
      + 'TS_FILTER TS_HEADLINE TS_RANK TS_RANK_CD TS_REWRITE TSQUERY_PHRASE TSVECTOR_TO_ARRAY '
      + 'TSVECTOR_UPDATE_TRIGGER TSVECTOR_UPDATE_TRIGGER_COLUMN '
      // https://www.postgresql.org/docs/11/static/functions-xml.html
      + 'XMLCOMMENT XMLCONCAT XMLELEMENT XMLFOREST XMLPI XMLROOT '
      + 'XMLEXISTS XML_IS_WELL_FORMED XML_IS_WELL_FORMED_DOCUMENT XML_IS_WELL_FORMED_CONTENT '
      + 'XPATH XPATH_EXISTS XMLTABLE XMLNAMESPACES '
      + 'TABLE_TO_XML TABLE_TO_XMLSCHEMA TABLE_TO_XML_AND_XMLSCHEMA '
      + 'QUERY_TO_XML QUERY_TO_XMLSCHEMA QUERY_TO_XML_AND_XMLSCHEMA '
      + 'CURSOR_TO_XML CURSOR_TO_XMLSCHEMA '
      + 'SCHEMA_TO_XML SCHEMA_TO_XMLSCHEMA SCHEMA_TO_XML_AND_XMLSCHEMA '
      + 'DATABASE_TO_XML DATABASE_TO_XMLSCHEMA DATABASE_TO_XML_AND_XMLSCHEMA '
      + 'XMLATTRIBUTES '
      // https://www.postgresql.org/docs/11/static/functions-json.html
      + 'TO_JSON TO_JSONB ARRAY_TO_JSON ROW_TO_JSON JSON_BUILD_ARRAY JSONB_BUILD_ARRAY JSON_BUILD_OBJECT '
      + 'JSONB_BUILD_OBJECT JSON_OBJECT JSONB_OBJECT JSON_ARRAY_LENGTH JSONB_ARRAY_LENGTH JSON_EACH '
      + 'JSONB_EACH JSON_EACH_TEXT JSONB_EACH_TEXT JSON_EXTRACT_PATH JSONB_EXTRACT_PATH '
      + 'JSON_OBJECT_KEYS JSONB_OBJECT_KEYS JSON_POPULATE_RECORD JSONB_POPULATE_RECORD JSON_POPULATE_RECORDSET '
      + 'JSONB_POPULATE_RECORDSET JSON_ARRAY_ELEMENTS JSONB_ARRAY_ELEMENTS JSON_ARRAY_ELEMENTS_TEXT '
      + 'JSONB_ARRAY_ELEMENTS_TEXT JSON_TYPEOF JSONB_TYPEOF JSON_TO_RECORD JSONB_TO_RECORD JSON_TO_RECORDSET '
      + 'JSONB_TO_RECORDSET JSON_STRIP_NULLS JSONB_STRIP_NULLS JSONB_SET JSONB_INSERT JSONB_PRETTY '
      // https://www.postgresql.org/docs/11/static/functions-sequence.html
      + 'CURRVAL LASTVAL NEXTVAL SETVAL '
      // https://www.postgresql.org/docs/11/static/functions-conditional.html
      + 'COALESCE NULLIF GREATEST LEAST '
      // https://www.postgresql.org/docs/11/static/functions-array.html
      + 'ARRAY_APPEND ARRAY_CAT ARRAY_NDIMS ARRAY_DIMS ARRAY_FILL ARRAY_LENGTH ARRAY_LOWER ARRAY_POSITION '
      + 'ARRAY_POSITIONS ARRAY_PREPEND ARRAY_REMOVE ARRAY_REPLACE ARRAY_TO_STRING ARRAY_UPPER CARDINALITY '
      + 'STRING_TO_ARRAY UNNEST '
      // https://www.postgresql.org/docs/11/static/functions-range.html
      + 'ISEMPTY LOWER_INC UPPER_INC LOWER_INF UPPER_INF RANGE_MERGE '
      // https://www.postgresql.org/docs/11/static/functions-srf.html
      + 'GENERATE_SERIES GENERATE_SUBSCRIPTS '
      // https://www.postgresql.org/docs/11/static/functions-info.html
      + 'CURRENT_DATABASE CURRENT_QUERY CURRENT_SCHEMA|10 CURRENT_SCHEMAS|10 INET_CLIENT_ADDR INET_CLIENT_PORT '
      + 'INET_SERVER_ADDR INET_SERVER_PORT ROW_SECURITY_ACTIVE FORMAT_TYPE '
      + 'TO_REGCLASS TO_REGPROC TO_REGPROCEDURE TO_REGOPER TO_REGOPERATOR TO_REGTYPE TO_REGNAMESPACE TO_REGROLE '
      + 'COL_DESCRIPTION OBJ_DESCRIPTION SHOBJ_DESCRIPTION '
      + 'TXID_CURRENT TXID_CURRENT_IF_ASSIGNED TXID_CURRENT_SNAPSHOT TXID_SNAPSHOT_XIP TXID_SNAPSHOT_XMAX '
      + 'TXID_SNAPSHOT_XMIN TXID_VISIBLE_IN_SNAPSHOT TXID_STATUS '
      // https://www.postgresql.org/docs/11/static/functions-admin.html
      + 'CURRENT_SETTING SET_CONFIG BRIN_SUMMARIZE_NEW_VALUES BRIN_SUMMARIZE_RANGE BRIN_DESUMMARIZE_RANGE '
      + 'GIN_CLEAN_PENDING_LIST '
      // https://www.postgresql.org/docs/11/static/functions-trigger.html
      + 'SUPPRESS_REDUNDANT_UPDATES_TRIGGER '
      // ihttps://www.postgresql.org/docs/devel/static/lo-funcs.html
      + 'LO_FROM_BYTEA LO_PUT LO_GET LO_CREAT LO_CREATE LO_UNLINK LO_IMPORT LO_EXPORT LOREAD LOWRITE '
      //
      + 'GROUPING CAST ';

    const FUNCTIONS_RE =
        FUNCTIONS.trim()
          .split(' ')
          .map(function(val) { return val.split('|')[0]; })
          .join('|');

    return {
      name: 'PostgreSQL',
      aliases: [
        'postgres',
        'postgresql'
      ],
      supersetOf: "sql",
      case_insensitive: true,
      keywords: {
        keyword:
              SQL_KW + PLPGSQL_KW + ROLE_ATTRS,
        built_in:
              SQL_BI + PLPGSQL_BI + PLPGSQL_EXCEPTIONS
      },
      // Forbid some cunstructs from other languages to improve autodetect. In fact
      // "[a-z]:" is legal (as part of array slice), but improbabal.
      illegal: /:==|\W\s*\(\*|(^|\s)\$[a-z]|\{\{|[a-z]:\s*$|\.\.\.|TO:|DO:/,
      contains: [
        // special handling of some words, which are reserved only in some contexts
        {
          className: 'keyword',
          variants: [
            { begin: /\bTEXT\s*SEARCH\b/ },
            { begin: /\b(PRIMARY|FOREIGN|FOR(\s+NO)?)\s+KEY\b/ },
            { begin: /\bPARALLEL\s+(UNSAFE|RESTRICTED|SAFE)\b/ },
            { begin: /\bSTORAGE\s+(PLAIN|EXTERNAL|EXTENDED|MAIN)\b/ },
            { begin: /\bMATCH\s+(FULL|PARTIAL|SIMPLE)\b/ },
            { begin: /\bNULLS\s+(FIRST|LAST)\b/ },
            { begin: /\bEVENT\s+TRIGGER\b/ },
            { begin: /\b(MAPPING|OR)\s+REPLACE\b/ },
            { begin: /\b(FROM|TO)\s+(PROGRAM|STDIN|STDOUT)\b/ },
            { begin: /\b(SHARE|EXCLUSIVE)\s+MODE\b/ },
            { begin: /\b(LEFT|RIGHT)\s+(OUTER\s+)?JOIN\b/ },
            { begin: /\b(FETCH|MOVE)\s+(NEXT|PRIOR|FIRST|LAST|ABSOLUTE|RELATIVE|FORWARD|BACKWARD)\b/ },
            { begin: /\bPRESERVE\s+ROWS\b/ },
            { begin: /\bDISCARD\s+PLANS\b/ },
            { begin: /\bREFERENCING\s+(OLD|NEW)\b/ },
            { begin: /\bSKIP\s+LOCKED\b/ },
            { begin: /\bGROUPING\s+SETS\b/ },
            { begin: /\b(BINARY|INSENSITIVE|SCROLL|NO\s+SCROLL)\s+(CURSOR|FOR)\b/ },
            { begin: /\b(WITH|WITHOUT)\s+HOLD\b/ },
            { begin: /\bWITH\s+(CASCADED|LOCAL)\s+CHECK\s+OPTION\b/ },
            { begin: /\bEXCLUDE\s+(TIES|NO\s+OTHERS)\b/ },
            { begin: /\bFORMAT\s+(TEXT|XML|JSON|YAML)\b/ },
            { begin: /\bSET\s+((SESSION|LOCAL)\s+)?NAMES\b/ },
            { begin: /\bIS\s+(NOT\s+)?UNKNOWN\b/ },
            { begin: /\bSECURITY\s+LABEL\b/ },
            { begin: /\bSTANDALONE\s+(YES|NO|NO\s+VALUE)\b/ },
            { begin: /\bWITH\s+(NO\s+)?DATA\b/ },
            { begin: /\b(FOREIGN|SET)\s+DATA\b/ },
            { begin: /\bSET\s+(CATALOG|CONSTRAINTS)\b/ },
            { begin: /\b(WITH|FOR)\s+ORDINALITY\b/ },
            { begin: /\bIS\s+(NOT\s+)?DOCUMENT\b/ },
            { begin: /\bXML\s+OPTION\s+(DOCUMENT|CONTENT)\b/ },
            { begin: /\b(STRIP|PRESERVE)\s+WHITESPACE\b/ },
            { begin: /\bNO\s+(ACTION|MAXVALUE|MINVALUE)\b/ },
            { begin: /\bPARTITION\s+BY\s+(RANGE|LIST|HASH)\b/ },
            { begin: /\bAT\s+TIME\s+ZONE\b/ },
            { begin: /\bGRANTED\s+BY\b/ },
            { begin: /\bRETURN\s+(QUERY|NEXT)\b/ },
            { begin: /\b(ATTACH|DETACH)\s+PARTITION\b/ },
            { begin: /\bFORCE\s+ROW\s+LEVEL\s+SECURITY\b/ },
            { begin: /\b(INCLUDING|EXCLUDING)\s+(COMMENTS|CONSTRAINTS|DEFAULTS|IDENTITY|INDEXES|STATISTICS|STORAGE|ALL)\b/ },
            { begin: /\bAS\s+(ASSIGNMENT|IMPLICIT|PERMISSIVE|RESTRICTIVE|ENUM|RANGE)\b/ }
          ]
        },
        // functions named as keywords, followed by '('
        { begin: /\b(FORMAT|FAMILY|VERSION)\s*\(/
          // keywords: { built_in: 'FORMAT FAMILY VERSION' }
        },
        // INCLUDE ( ... ) in index_parameters in CREATE TABLE
        {
          begin: /\bINCLUDE\s*\(/,
          keywords: 'INCLUDE'
        },
        // not highlight RANGE if not in frame_clause (not 100% correct, but seems satisfactory)
        { begin: /\bRANGE(?!\s*(BETWEEN|UNBOUNDED|CURRENT|[-0-9]+))/ },
        // disable highlighting in commands CREATE AGGREGATE/COLLATION/DATABASE/OPERTOR/TEXT SEARCH .../TYPE
        // and in PL/pgSQL RAISE ... USING
        { begin: /\b(VERSION|OWNER|TEMPLATE|TABLESPACE|CONNECTION\s+LIMIT|PROCEDURE|RESTRICT|JOIN|PARSER|COPY|START|END|COLLATION|INPUT|ANALYZE|STORAGE|LIKE|DEFAULT|DELIMITER|ENCODING|COLUMN|CONSTRAINT|TABLE|SCHEMA)\s*=/ },
        // PG_smth; HAS_some_PRIVILEGE
        {
          // className: 'built_in',
          begin: /\b(PG_\w+?|HAS_[A-Z_]+_PRIVILEGE)\b/,
          relevance: 10
        },
        // extract
        {
          begin: /\bEXTRACT\s*\(/,
          end: /\bFROM\b/,
          returnEnd: true,
          keywords: {
            // built_in: 'EXTRACT',
            type: 'CENTURY DAY DECADE DOW DOY EPOCH HOUR ISODOW ISOYEAR MICROSECONDS '
                          + 'MILLENNIUM MILLISECONDS MINUTE MONTH QUARTER SECOND TIMEZONE TIMEZONE_HOUR '
                          + 'TIMEZONE_MINUTE WEEK YEAR' }
        },
        // xmlelement, xmlpi - special NAME
        {
          begin: /\b(XMLELEMENT|XMLPI)\s*\(\s*NAME/,
          keywords: {
            // built_in: 'XMLELEMENT XMLPI',
            keyword: 'NAME' }
        },
        // xmlparse, xmlserialize
        {
          begin: /\b(XMLPARSE|XMLSERIALIZE)\s*\(\s*(DOCUMENT|CONTENT)/,
          keywords: {
            // built_in: 'XMLPARSE XMLSERIALIZE',
            keyword: 'DOCUMENT CONTENT' }
        },
        // Sequences. We actually skip everything between CACHE|INCREMENT|MAXVALUE|MINVALUE and
        // nearest following numeric constant. Without with trick we find a lot of "keywords"
        // in 'avrasm' autodetection test...
        {
          beginKeywords: 'CACHE INCREMENT MAXVALUE MINVALUE',
          end: hljs.C_NUMBER_RE,
          returnEnd: true,
          keywords: 'BY CACHE INCREMENT MAXVALUE MINVALUE'
        },
        // WITH|WITHOUT TIME ZONE as part of datatype
        {
          className: 'type',
          begin: /\b(WITH|WITHOUT)\s+TIME\s+ZONE\b/
        },
        // INTERVAL optional fields
        {
          className: 'type',
          begin: /\bINTERVAL\s+(YEAR|MONTH|DAY|HOUR|MINUTE|SECOND)(\s+TO\s+(MONTH|HOUR|MINUTE|SECOND))?\b/
        },
        // Pseudo-types which allowed only as return type
        {
          begin: /\bRETURNS\s+(LANGUAGE_HANDLER|TRIGGER|EVENT_TRIGGER|FDW_HANDLER|INDEX_AM_HANDLER|TSM_HANDLER)\b/,
          keywords: {
            keyword: 'RETURNS',
            type: 'LANGUAGE_HANDLER TRIGGER EVENT_TRIGGER FDW_HANDLER INDEX_AM_HANDLER TSM_HANDLER'
          }
        },
        // Known functions - only when followed by '('
        { begin: '\\b(' + FUNCTIONS_RE + ')\\s*\\('
          // keywords: { built_in: FUNCTIONS }
        },
        // Types
        { begin: '\\.(' + TYPES_RE + ')\\b' // prevent highlight as type, say, 'oid' in 'pgclass.oid'
        },
        {
          begin: '\\b(' + TYPES_RE + ')\\s+PATH\\b', // in XMLTABLE
          keywords: {
            keyword: 'PATH', // hopefully no one would use PATH type in XMLTABLE...
            type: TYPES.replace('PATH ', '')
          }
        },
        {
          className: 'type',
          begin: '\\b(' + TYPES_RE + ')\\b'
        },
        // Strings, see https://www.postgresql.org/docs/11/static/sql-syntax-lexical.html#SQL-SYNTAX-CONSTANTS
        {
          className: 'string',
          begin: '\'',
          end: '\'',
          contains: [ { begin: '\'\'' } ]
        },
        {
          className: 'string',
          begin: '(e|E|u&|U&)\'',
          end: '\'',
          contains: [ { begin: '\\\\.' } ],
          relevance: 10
        },
        hljs.END_SAME_AS_BEGIN({
          begin: DOLLAR_STRING,
          end: DOLLAR_STRING,
          contains: [
            {
              // actually we want them all except SQL; listed are those with known implementations
              // and XML + JSON just in case
              subLanguage: [
                'pgsql',
                'perl',
                'python',
                'tcl',
                'r',
                'lua',
                'java',
                'php',
                'ruby',
                'bash',
                'scheme',
                'xml',
                'json'
              ],
              endsWithParent: true
            }
          ]
        }),
        // identifiers in quotes
        {
          begin: '"',
          end: '"',
          contains: [ { begin: '""' } ]
        },
        // numbers
        hljs.C_NUMBER_MODE,
        // comments
        hljs.C_BLOCK_COMMENT_MODE,
        COMMENT_MODE,
        // PL/pgSQL staff
        // %ROWTYPE, %TYPE, $n
        {
          className: 'meta',
          variants: [
            { // %TYPE, %ROWTYPE
              begin: '%(ROW)?TYPE',
              relevance: 10
            },
            { // $n
              begin: '\\$\\d+' },
            { // #compiler option
              begin: '^#\\w',
              end: '$'
            }
          ]
        },
        // <<labeles>>
        {
          className: 'symbol',
          begin: LABEL,
          relevance: 10
        }
      ]
    };
  }

  return pgsql;

})();

    hljs.registerLanguage('pgsql', hljsGrammar);
  })();/*! `php` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: PHP
  Author: Victor Karamzin <Victor.Karamzin@enterra-inc.com>
  Contributors: Evgeny Stepanischev <imbolk@gmail.com>, Ivan Sagalaev <maniac@softwaremaniacs.org>
  Website: https://www.php.net
  Category: common
  */

  /**
   * @param {HLJSApi} hljs
   * @returns {LanguageDetail}
   * */
  function php(hljs) {
    const regex = hljs.regex;
    // negative look-ahead tries to avoid matching patterns that are not
    // Perl at all like $ident$, @ident@, etc.
    const NOT_PERL_ETC = /(?![A-Za-z0-9])(?![$])/;
    const IDENT_RE = regex.concat(
      /[a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*/,
      NOT_PERL_ETC);
    // Will not detect camelCase classes
    const PASCAL_CASE_CLASS_NAME_RE = regex.concat(
      /(\\?[A-Z][a-z0-9_\x7f-\xff]+|\\?[A-Z]+(?=[A-Z][a-z0-9_\x7f-\xff])){1,}/,
      NOT_PERL_ETC);
    const UPCASE_NAME_RE = regex.concat(
      /[A-Z]+/,
      NOT_PERL_ETC);
    const VARIABLE = {
      scope: 'variable',
      match: '\\$+' + IDENT_RE,
    };
    const PREPROCESSOR = {
      scope: "meta",
      variants: [
        { begin: /<\?php/, relevance: 10 }, // boost for obvious PHP
        { begin: /<\?=/ },
        // less relevant per PSR-1 which says not to use short-tags
        { begin: /<\?/, relevance: 0.1 },
        { begin: /\?>/ } // end php tag
      ]
    };
    const SUBST = {
      scope: 'subst',
      variants: [
        { begin: /\$\w+/ },
        {
          begin: /\{\$/,
          end: /\}/
        }
      ]
    };
    const SINGLE_QUOTED = hljs.inherit(hljs.APOS_STRING_MODE, { illegal: null, });
    const DOUBLE_QUOTED = hljs.inherit(hljs.QUOTE_STRING_MODE, {
      illegal: null,
      contains: hljs.QUOTE_STRING_MODE.contains.concat(SUBST),
    });

    const HEREDOC = {
      begin: /<<<[ \t]*(?:(\w+)|"(\w+)")\n/,
      end: /[ \t]*(\w+)\b/,
      contains: hljs.QUOTE_STRING_MODE.contains.concat(SUBST),
      'on:begin': (m, resp) => { resp.data._beginMatch = m[1] || m[2]; },
      'on:end': (m, resp) => { if (resp.data._beginMatch !== m[1]) resp.ignoreMatch(); },
    };

    const NOWDOC = hljs.END_SAME_AS_BEGIN({
      begin: /<<<[ \t]*'(\w+)'\n/,
      end: /[ \t]*(\w+)\b/,
    });
    // list of valid whitespaces because non-breaking space might be part of a IDENT_RE
    const WHITESPACE = '[ \t\n]';
    const STRING = {
      scope: 'string',
      variants: [
        DOUBLE_QUOTED,
        SINGLE_QUOTED,
        HEREDOC,
        NOWDOC
      ]
    };
    const NUMBER = {
      scope: 'number',
      variants: [
        { begin: `\\b0[bB][01]+(?:_[01]+)*\\b` }, // Binary w/ underscore support
        { begin: `\\b0[oO][0-7]+(?:_[0-7]+)*\\b` }, // Octals w/ underscore support
        { begin: `\\b0[xX][\\da-fA-F]+(?:_[\\da-fA-F]+)*\\b` }, // Hex w/ underscore support
        // Decimals w/ underscore support, with optional fragments and scientific exponent (e) suffix.
        { begin: `(?:\\b\\d+(?:_\\d+)*(\\.(?:\\d+(?:_\\d+)*))?|\\B\\.\\d+)(?:[eE][+-]?\\d+)?` }
      ],
      relevance: 0
    };
    const LITERALS = [
      "false",
      "null",
      "true"
    ];
    const KWS = [
      // Magic constants:
      // <https://www.php.net/manual/en/language.constants.predefined.php>
      "__CLASS__",
      "__DIR__",
      "__FILE__",
      "__FUNCTION__",
      "__COMPILER_HALT_OFFSET__",
      "__LINE__",
      "__METHOD__",
      "__NAMESPACE__",
      "__TRAIT__",
      // Function that look like language construct or language construct that look like function:
      // List of keywords that may not require parenthesis
      "die",
      "echo",
      "exit",
      "include",
      "include_once",
      "print",
      "require",
      "require_once",
      // These are not language construct (function) but operate on the currently-executing function and can access the current symbol table
      // 'compact extract func_get_arg func_get_args func_num_args get_called_class get_parent_class ' +
      // Other keywords:
      // <https://www.php.net/manual/en/reserved.php>
      // <https://www.php.net/manual/en/language.types.type-juggling.php>
      "array",
      "abstract",
      "and",
      "as",
      "binary",
      "bool",
      "boolean",
      "break",
      "callable",
      "case",
      "catch",
      "class",
      "clone",
      "const",
      "continue",
      "declare",
      "default",
      "do",
      "double",
      "else",
      "elseif",
      "empty",
      "enddeclare",
      "endfor",
      "endforeach",
      "endif",
      "endswitch",
      "endwhile",
      "enum",
      "eval",
      "extends",
      "final",
      "finally",
      "float",
      "for",
      "foreach",
      "from",
      "global",
      "goto",
      "if",
      "implements",
      "instanceof",
      "insteadof",
      "int",
      "integer",
      "interface",
      "isset",
      "iterable",
      "list",
      "match|0",
      "mixed",
      "new",
      "never",
      "object",
      "or",
      "private",
      "protected",
      "public",
      "readonly",
      "real",
      "return",
      "string",
      "switch",
      "throw",
      "trait",
      "try",
      "unset",
      "use",
      "var",
      "void",
      "while",
      "xor",
      "yield"
    ];

    const BUILT_INS = [
      // Standard PHP library:
      // <https://www.php.net/manual/en/book.spl.php>
      "Error|0",
      "AppendIterator",
      "ArgumentCountError",
      "ArithmeticError",
      "ArrayIterator",
      "ArrayObject",
      "AssertionError",
      "BadFunctionCallException",
      "BadMethodCallException",
      "CachingIterator",
      "CallbackFilterIterator",
      "CompileError",
      "Countable",
      "DirectoryIterator",
      "DivisionByZeroError",
      "DomainException",
      "EmptyIterator",
      "ErrorException",
      "Exception",
      "FilesystemIterator",
      "FilterIterator",
      "GlobIterator",
      "InfiniteIterator",
      "InvalidArgumentException",
      "IteratorIterator",
      "LengthException",
      "LimitIterator",
      "LogicException",
      "MultipleIterator",
      "NoRewindIterator",
      "OutOfBoundsException",
      "OutOfRangeException",
      "OuterIterator",
      "OverflowException",
      "ParentIterator",
      "ParseError",
      "RangeException",
      "RecursiveArrayIterator",
      "RecursiveCachingIterator",
      "RecursiveCallbackFilterIterator",
      "RecursiveDirectoryIterator",
      "RecursiveFilterIterator",
      "RecursiveIterator",
      "RecursiveIteratorIterator",
      "RecursiveRegexIterator",
      "RecursiveTreeIterator",
      "RegexIterator",
      "RuntimeException",
      "SeekableIterator",
      "SplDoublyLinkedList",
      "SplFileInfo",
      "SplFileObject",
      "SplFixedArray",
      "SplHeap",
      "SplMaxHeap",
      "SplMinHeap",
      "SplObjectStorage",
      "SplObserver",
      "SplPriorityQueue",
      "SplQueue",
      "SplStack",
      "SplSubject",
      "SplTempFileObject",
      "TypeError",
      "UnderflowException",
      "UnexpectedValueException",
      "UnhandledMatchError",
      // Reserved interfaces:
      // <https://www.php.net/manual/en/reserved.interfaces.php>
      "ArrayAccess",
      "BackedEnum",
      "Closure",
      "Fiber",
      "Generator",
      "Iterator",
      "IteratorAggregate",
      "Serializable",
      "Stringable",
      "Throwable",
      "Traversable",
      "UnitEnum",
      "WeakReference",
      "WeakMap",
      // Reserved classes:
      // <https://www.php.net/manual/en/reserved.classes.php>
      "Directory",
      "__PHP_Incomplete_Class",
      "parent",
      "php_user_filter",
      "self",
      "static",
      "stdClass"
    ];

    /** Dual-case keywords
     *
     * ["then","FILE"] =>
     *     ["then", "THEN", "FILE", "file"]
     *
     * @param {string[]} items */
    const dualCase = (items) => {
      /** @type string[] */
      const result = [];
      items.forEach(item => {
        result.push(item);
        if (item.toLowerCase() === item) {
          result.push(item.toUpperCase());
        } else {
          result.push(item.toLowerCase());
        }
      });
      return result;
    };

    const KEYWORDS = {
      keyword: KWS,
      literal: dualCase(LITERALS),
      built_in: BUILT_INS,
    };

    /**
     * @param {string[]} items */
    const normalizeKeywords = (items) => {
      return items.map(item => {
        return item.replace(/\|\d+$/, "");
      });
    };

    const CONSTRUCTOR_CALL = { variants: [
      {
        match: [
          /new/,
          regex.concat(WHITESPACE, "+"),
          // to prevent built ins from being confused as the class constructor call
          regex.concat("(?!", normalizeKeywords(BUILT_INS).join("\\b|"), "\\b)"),
          PASCAL_CASE_CLASS_NAME_RE,
        ],
        scope: {
          1: "keyword",
          4: "title.class",
        },
      }
    ] };

    const CONSTANT_REFERENCE = regex.concat(IDENT_RE, "\\b(?!\\()");

    const LEFT_AND_RIGHT_SIDE_OF_DOUBLE_COLON = { variants: [
      {
        match: [
          regex.concat(
            /::/,
            regex.lookahead(/(?!class\b)/)
          ),
          CONSTANT_REFERENCE,
        ],
        scope: { 2: "variable.constant", },
      },
      {
        match: [
          /::/,
          /class/,
        ],
        scope: { 2: "variable.language", },
      },
      {
        match: [
          PASCAL_CASE_CLASS_NAME_RE,
          regex.concat(
            /::/,
            regex.lookahead(/(?!class\b)/)
          ),
          CONSTANT_REFERENCE,
        ],
        scope: {
          1: "title.class",
          3: "variable.constant",
        },
      },
      {
        match: [
          PASCAL_CASE_CLASS_NAME_RE,
          regex.concat(
            "::",
            regex.lookahead(/(?!class\b)/)
          ),
        ],
        scope: { 1: "title.class", },
      },
      {
        match: [
          PASCAL_CASE_CLASS_NAME_RE,
          /::/,
          /class/,
        ],
        scope: {
          1: "title.class",
          3: "variable.language",
        },
      }
    ] };

    const NAMED_ARGUMENT = {
      scope: 'attr',
      match: regex.concat(IDENT_RE, regex.lookahead(':'), regex.lookahead(/(?!::)/)),
    };
    const PARAMS_MODE = {
      relevance: 0,
      begin: /\(/,
      end: /\)/,
      keywords: KEYWORDS,
      contains: [
        NAMED_ARGUMENT,
        VARIABLE,
        LEFT_AND_RIGHT_SIDE_OF_DOUBLE_COLON,
        hljs.C_BLOCK_COMMENT_MODE,
        STRING,
        NUMBER,
        CONSTRUCTOR_CALL,
      ],
    };
    const FUNCTION_INVOKE = {
      relevance: 0,
      match: [
        /\b/,
        // to prevent keywords from being confused as the function title
        regex.concat("(?!fn\\b|function\\b|", normalizeKeywords(KWS).join("\\b|"), "|", normalizeKeywords(BUILT_INS).join("\\b|"), "\\b)"),
        IDENT_RE,
        regex.concat(WHITESPACE, "*"),
        regex.lookahead(/(?=\()/)
      ],
      scope: { 3: "title.function.invoke", },
      contains: [ PARAMS_MODE ]
    };
    PARAMS_MODE.contains.push(FUNCTION_INVOKE);

    const ATTRIBUTE_CONTAINS = [
      NAMED_ARGUMENT,
      LEFT_AND_RIGHT_SIDE_OF_DOUBLE_COLON,
      hljs.C_BLOCK_COMMENT_MODE,
      STRING,
      NUMBER,
      CONSTRUCTOR_CALL,
    ];

    const ATTRIBUTES = {
      begin: regex.concat(/#\[\s*\\?/,
        regex.either(
          PASCAL_CASE_CLASS_NAME_RE,
          UPCASE_NAME_RE
        )
      ),
      beginScope: "meta",
      end: /]/,
      endScope: "meta",
      keywords: {
        literal: LITERALS,
        keyword: [
          'new',
          'array',
        ]
      },
      contains: [
        {
          begin: /\[/,
          end: /]/,
          keywords: {
            literal: LITERALS,
            keyword: [
              'new',
              'array',
            ]
          },
          contains: [
            'self',
            ...ATTRIBUTE_CONTAINS,
          ]
        },
        ...ATTRIBUTE_CONTAINS,
        {
          scope: 'meta',
          variants: [
            { match: PASCAL_CASE_CLASS_NAME_RE },
            { match: UPCASE_NAME_RE }
          ]
        }
      ]
    };

    return {
      case_insensitive: false,
      keywords: KEYWORDS,
      contains: [
        ATTRIBUTES,
        hljs.HASH_COMMENT_MODE,
        hljs.COMMENT('//', '$'),
        hljs.COMMENT(
          '/\\*',
          '\\*/',
          { contains: [
            {
              scope: 'doctag',
              match: '@[A-Za-z]+'
            }
          ] }
        ),
        {
          match: /__halt_compiler\(\);/,
          keywords: '__halt_compiler',
          starts: {
            scope: "comment",
            end: hljs.MATCH_NOTHING_RE,
            contains: [
              {
                match: /\?>/,
                scope: "meta",
                endsParent: true
              }
            ]
          }
        },
        PREPROCESSOR,
        {
          scope: 'variable.language',
          match: /\$this\b/
        },
        VARIABLE,
        FUNCTION_INVOKE,
        LEFT_AND_RIGHT_SIDE_OF_DOUBLE_COLON,
        {
          match: [
            /const/,
            /\s/,
            IDENT_RE,
          ],
          scope: {
            1: "keyword",
            3: "variable.constant",
          },
        },
        CONSTRUCTOR_CALL,
        {
          scope: 'function',
          relevance: 0,
          beginKeywords: 'fn function',
          end: /[;{]/,
          excludeEnd: true,
          illegal: '[$%\\[]',
          contains: [
            { beginKeywords: 'use', },
            hljs.UNDERSCORE_TITLE_MODE,
            {
              begin: '=>', // No markup, just a relevance booster
              endsParent: true
            },
            {
              scope: 'params',
              begin: '\\(',
              end: '\\)',
              excludeBegin: true,
              excludeEnd: true,
              keywords: KEYWORDS,
              contains: [
                'self',
                ATTRIBUTES,
                VARIABLE,
                LEFT_AND_RIGHT_SIDE_OF_DOUBLE_COLON,
                hljs.C_BLOCK_COMMENT_MODE,
                STRING,
                NUMBER
              ]
            },
          ]
        },
        {
          scope: 'class',
          variants: [
            {
              beginKeywords: "enum",
              illegal: /[($"]/
            },
            {
              beginKeywords: "class interface trait",
              illegal: /[:($"]/
            }
          ],
          relevance: 0,
          end: /\{/,
          excludeEnd: true,
          contains: [
            { beginKeywords: 'extends implements' },
            hljs.UNDERSCORE_TITLE_MODE
          ]
        },
        // both use and namespace still use "old style" rules (vs multi-match)
        // because the namespace name can include `\` and we still want each
        // element to be treated as its own *individual* title
        {
          beginKeywords: 'namespace',
          relevance: 0,
          end: ';',
          illegal: /[.']/,
          contains: [ hljs.inherit(hljs.UNDERSCORE_TITLE_MODE, { scope: "title.class" }) ]
        },
        {
          beginKeywords: 'use',
          relevance: 0,
          end: ';',
          contains: [
            // TODO: title.function vs title.class
            {
              match: /\b(as|const|function)\b/,
              scope: "keyword"
            },
            // TODO: could be title.class or title.function
            hljs.UNDERSCORE_TITLE_MODE
          ]
        },
        STRING,
        NUMBER,
      ]
    };
  }

  return php;

})();

    hljs.registerLanguage('php', hljsGrammar);
  })();/*! `php-template` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: PHP Template
  Requires: xml.js, php.js
  Author: Josh Goebel <hello@joshgoebel.com>
  Website: https://www.php.net
  Category: common
  */

  function phpTemplate(hljs) {
    return {
      name: "PHP template",
      subLanguage: 'xml',
      contains: [
        {
          begin: /<\?(php|=)?/,
          end: /\?>/,
          subLanguage: 'php',
          contains: [
            // We don't want the php closing tag ?> to close the PHP block when
            // inside any of the following blocks:
            {
              begin: '/\\*',
              end: '\\*/',
              skip: true
            },
            {
              begin: 'b"',
              end: '"',
              skip: true
            },
            {
              begin: 'b\'',
              end: '\'',
              skip: true
            },
            hljs.inherit(hljs.APOS_STRING_MODE, {
              illegal: null,
              className: null,
              contains: null,
              skip: true
            }),
            hljs.inherit(hljs.QUOTE_STRING_MODE, {
              illegal: null,
              className: null,
              contains: null,
              skip: true
            })
          ]
        }
      ]
    };
  }

  return phpTemplate;

})();

    hljs.registerLanguage('php-template', hljsGrammar);
  })();/*! `plaintext` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Plain text
  Author: Egor Rogov (e.rogov@postgrespro.ru)
  Description: Plain text without any highlighting.
  Category: common
  */

  function plaintext(hljs) {
    return {
      name: 'Plain text',
      aliases: [
        'text',
        'txt'
      ],
      disableAutodetect: true
    };
  }

  return plaintext;

})();

    hljs.registerLanguage('plaintext', hljsGrammar);
  })();/*! `powershell` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: PowerShell
  Description: PowerShell is a task-based command-line shell and scripting language built on .NET.
  Author: David Mohundro <david@mohundro.com>
  Contributors: Nicholas Blumhardt <nblumhardt@nblumhardt.com>, Victor Zhou <OiCMudkips@users.noreply.github.com>, Nicolas Le Gall <contact@nlegall.fr>
  Website: https://docs.microsoft.com/en-us/powershell/
  Category: scripting
  */

  function powershell(hljs) {
    const TYPES = [
      "string",
      "char",
      "byte",
      "int",
      "long",
      "bool",
      "decimal",
      "single",
      "double",
      "DateTime",
      "xml",
      "array",
      "hashtable",
      "void"
    ];

    // https://docs.microsoft.com/en-us/powershell/scripting/developer/cmdlet/approved-verbs-for-windows-powershell-commands
    const VALID_VERBS =
      'Add|Clear|Close|Copy|Enter|Exit|Find|Format|Get|Hide|Join|Lock|'
      + 'Move|New|Open|Optimize|Pop|Push|Redo|Remove|Rename|Reset|Resize|'
      + 'Search|Select|Set|Show|Skip|Split|Step|Switch|Undo|Unlock|'
      + 'Watch|Backup|Checkpoint|Compare|Compress|Convert|ConvertFrom|'
      + 'ConvertTo|Dismount|Edit|Expand|Export|Group|Import|Initialize|'
      + 'Limit|Merge|Mount|Out|Publish|Restore|Save|Sync|Unpublish|Update|'
      + 'Approve|Assert|Build|Complete|Confirm|Deny|Deploy|Disable|Enable|Install|Invoke|'
      + 'Register|Request|Restart|Resume|Start|Stop|Submit|Suspend|Uninstall|'
      + 'Unregister|Wait|Debug|Measure|Ping|Repair|Resolve|Test|Trace|Connect|'
      + 'Disconnect|Read|Receive|Send|Write|Block|Grant|Protect|Revoke|Unblock|'
      + 'Unprotect|Use|ForEach|Sort|Tee|Where';

    const COMPARISON_OPERATORS =
      '-and|-as|-band|-bnot|-bor|-bxor|-casesensitive|-ccontains|-ceq|-cge|-cgt|'
      + '-cle|-clike|-clt|-cmatch|-cne|-cnotcontains|-cnotlike|-cnotmatch|-contains|'
      + '-creplace|-csplit|-eq|-exact|-f|-file|-ge|-gt|-icontains|-ieq|-ige|-igt|'
      + '-ile|-ilike|-ilt|-imatch|-in|-ine|-inotcontains|-inotlike|-inotmatch|'
      + '-ireplace|-is|-isnot|-isplit|-join|-le|-like|-lt|-match|-ne|-not|'
      + '-notcontains|-notin|-notlike|-notmatch|-or|-regex|-replace|-shl|-shr|'
      + '-split|-wildcard|-xor';

    const KEYWORDS = {
      $pattern: /-?[A-z\.\-]+\b/,
      keyword:
        'if else foreach return do while until elseif begin for trap data dynamicparam '
        + 'end break throw param continue finally in switch exit filter try process catch '
        + 'hidden static parameter',
      // "echo" relevance has been set to 0 to avoid auto-detect conflicts with shell transcripts
      built_in:
        'ac asnp cat cd CFS chdir clc clear clhy cli clp cls clv cnsn compare copy cp '
        + 'cpi cpp curl cvpa dbp del diff dir dnsn ebp echo|0 epal epcsv epsn erase etsn exsn fc fhx '
        + 'fl ft fw gal gbp gc gcb gci gcm gcs gdr gerr ghy gi gin gjb gl gm gmo gp gps gpv group '
        + 'gsn gsnp gsv gtz gu gv gwmi h history icm iex ihy ii ipal ipcsv ipmo ipsn irm ise iwmi '
        + 'iwr kill lp ls man md measure mi mount move mp mv nal ndr ni nmo npssc nsn nv ogv oh '
        + 'popd ps pushd pwd r rbp rcjb rcsn rd rdr ren ri rjb rm rmdir rmo rni rnp rp rsn rsnp '
        + 'rujb rv rvpa rwmi sajb sal saps sasv sbp sc scb select set shcm si sl sleep sls sort sp '
        + 'spjb spps spsv start stz sujb sv swmi tee trcm type wget where wjb write'
      // TODO: 'validate[A-Z]+' can't work in keywords
    };

    const TITLE_NAME_RE = /\w[\w\d]*((-)[\w\d]+)*/;

    const BACKTICK_ESCAPE = {
      begin: '`[\\s\\S]',
      relevance: 0
    };

    const VAR = {
      className: 'variable',
      variants: [
        { begin: /\$\B/ },
        {
          className: 'keyword',
          begin: /\$this/
        },
        { begin: /\$[\w\d][\w\d_:]*/ }
      ]
    };

    const LITERAL = {
      className: 'literal',
      begin: /\$(null|true|false)\b/
    };

    const QUOTE_STRING = {
      className: "string",
      variants: [
        {
          begin: /"/,
          end: /"/
        },
        {
          begin: /@"/,
          end: /^"@/
        }
      ],
      contains: [
        BACKTICK_ESCAPE,
        VAR,
        {
          className: 'variable',
          begin: /\$[A-z]/,
          end: /[^A-z]/
        }
      ]
    };

    const APOS_STRING = {
      className: 'string',
      variants: [
        {
          begin: /'/,
          end: /'/
        },
        {
          begin: /@'/,
          end: /^'@/
        }
      ]
    };

    const PS_HELPTAGS = {
      className: "doctag",
      variants: [
        /* no paramater help tags */
        { begin: /\.(synopsis|description|example|inputs|outputs|notes|link|component|role|functionality)/ },
        /* one parameter help tags */
        { begin: /\.(parameter|forwardhelptargetname|forwardhelpcategory|remotehelprunspace|externalhelp)\s+\S+/ }
      ]
    };

    const PS_COMMENT = hljs.inherit(
      hljs.COMMENT(null, null),
      {
        variants: [
          /* single-line comment */
          {
            begin: /#/,
            end: /$/
          },
          /* multi-line comment */
          {
            begin: /<#/,
            end: /#>/
          }
        ],
        contains: [ PS_HELPTAGS ]
      }
    );

    const CMDLETS = {
      className: 'built_in',
      variants: [ { begin: '('.concat(VALID_VERBS, ')+(-)[\\w\\d]+') } ]
    };

    const PS_CLASS = {
      className: 'class',
      beginKeywords: 'class enum',
      end: /\s*[{]/,
      excludeEnd: true,
      relevance: 0,
      contains: [ hljs.TITLE_MODE ]
    };

    const PS_FUNCTION = {
      className: 'function',
      begin: /function\s+/,
      end: /\s*\{|$/,
      excludeEnd: true,
      returnBegin: true,
      relevance: 0,
      contains: [
        {
          begin: "function",
          relevance: 0,
          className: "keyword"
        },
        {
          className: "title",
          begin: TITLE_NAME_RE,
          relevance: 0
        },
        {
          begin: /\(/,
          end: /\)/,
          className: "params",
          relevance: 0,
          contains: [ VAR ]
        }
        // CMDLETS
      ]
    };

    // Using statment, plus type, plus assembly name.
    const PS_USING = {
      begin: /using\s/,
      end: /$/,
      returnBegin: true,
      contains: [
        QUOTE_STRING,
        APOS_STRING,
        {
          className: 'keyword',
          begin: /(using|assembly|command|module|namespace|type)/
        }
      ]
    };

    // Comperison operators & function named parameters.
    const PS_ARGUMENTS = { variants: [
      // PS literals are pretty verbose so it's a good idea to accent them a bit.
      {
        className: 'operator',
        begin: '('.concat(COMPARISON_OPERATORS, ')\\b')
      },
      {
        className: 'literal',
        begin: /(-){1,2}[\w\d-]+/,
        relevance: 0
      }
    ] };

    const HASH_SIGNS = {
      className: 'selector-tag',
      begin: /@\B/,
      relevance: 0
    };

    // It's a very general rule so I'll narrow it a bit with some strict boundaries
    // to avoid any possible false-positive collisions!
    const PS_METHODS = {
      className: 'function',
      begin: /\[.*\]\s*[\w]+[ ]??\(/,
      end: /$/,
      returnBegin: true,
      relevance: 0,
      contains: [
        {
          className: 'keyword',
          begin: '('.concat(
            KEYWORDS.keyword.toString().replace(/\s/g, '|'
            ), ')\\b'),
          endsParent: true,
          relevance: 0
        },
        hljs.inherit(hljs.TITLE_MODE, { endsParent: true })
      ]
    };

    const GENTLEMANS_SET = [
      // STATIC_MEMBER,
      PS_METHODS,
      PS_COMMENT,
      BACKTICK_ESCAPE,
      hljs.NUMBER_MODE,
      QUOTE_STRING,
      APOS_STRING,
      // PS_NEW_OBJECT_TYPE,
      CMDLETS,
      VAR,
      LITERAL,
      HASH_SIGNS
    ];

    const PS_TYPE = {
      begin: /\[/,
      end: /\]/,
      excludeBegin: true,
      excludeEnd: true,
      relevance: 0,
      contains: [].concat(
        'self',
        GENTLEMANS_SET,
        {
          begin: "(" + TYPES.join("|") + ")",
          className: "built_in",
          relevance: 0
        },
        {
          className: 'type',
          begin: /[\.\w\d]+/,
          relevance: 0
        }
      )
    };

    PS_METHODS.contains.unshift(PS_TYPE);

    return {
      name: 'PowerShell',
      aliases: [
        "pwsh",
        "ps",
        "ps1"
      ],
      case_insensitive: true,
      keywords: KEYWORDS,
      contains: GENTLEMANS_SET.concat(
        PS_CLASS,
        PS_FUNCTION,
        PS_USING,
        PS_ARGUMENTS,
        PS_TYPE
      )
    };
  }

  return powershell;

})();

    hljs.registerLanguage('powershell', hljsGrammar);
  })();/*! `properties` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: .properties
  Contributors: Valentin Aitken <valentin@nalisbg.com>, Egor Rogov <e.rogov@postgrespro.ru>
  Website: https://en.wikipedia.org/wiki/.properties
  Category: config
  */

  /** @type LanguageFn */
  function properties(hljs) {
    // whitespaces: space, tab, formfeed
    const WS0 = '[ \\t\\f]*';
    const WS1 = '[ \\t\\f]+';
    // delimiter
    const EQUAL_DELIM = WS0 + '[:=]' + WS0;
    const WS_DELIM = WS1;
    const DELIM = '(' + EQUAL_DELIM + '|' + WS_DELIM + ')';
    const KEY = '([^\\\\:= \\t\\f\\n]|\\\\.)+';

    const DELIM_AND_VALUE = {
      // skip DELIM
      end: DELIM,
      relevance: 0,
      starts: {
        // value: everything until end of line (again, taking into account backslashes)
        className: 'string',
        end: /$/,
        relevance: 0,
        contains: [
          { begin: '\\\\\\\\' },
          { begin: '\\\\\\n' }
        ]
      }
    };

    return {
      name: '.properties',
      disableAutodetect: true,
      case_insensitive: true,
      illegal: /\S/,
      contains: [
        hljs.COMMENT('^\\s*[!#]', '$'),
        // key: everything until whitespace or = or : (taking into account backslashes)
        // case of a key-value pair
        {
          returnBegin: true,
          variants: [
            { begin: KEY + EQUAL_DELIM },
            { begin: KEY + WS_DELIM }
          ],
          contains: [
            {
              className: 'attr',
              begin: KEY,
              endsParent: true
            }
          ],
          starts: DELIM_AND_VALUE
        },
        // case of an empty key
        {
          className: 'attr',
          begin: KEY + WS0 + '$'
        }
      ]
    };
  }

  return properties;

})();

    hljs.registerLanguage('properties', hljsGrammar);
  })();/*! `protobuf` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Protocol Buffers
  Author: Dan Tao <daniel.tao@gmail.com>
  Description: Protocol buffer message definition format
  Website: https://developers.google.com/protocol-buffers/docs/proto3
  Category: protocols
  */

  function protobuf(hljs) {
    const KEYWORDS = [
      "package",
      "import",
      "option",
      "optional",
      "required",
      "repeated",
      "group",
      "oneof"
    ];
    const TYPES = [
      "double",
      "float",
      "int32",
      "int64",
      "uint32",
      "uint64",
      "sint32",
      "sint64",
      "fixed32",
      "fixed64",
      "sfixed32",
      "sfixed64",
      "bool",
      "string",
      "bytes"
    ];
    const CLASS_DEFINITION = {
      match: [
        /(message|enum|service)\s+/,
        hljs.IDENT_RE
      ],
      scope: {
        1: "keyword",
        2: "title.class"
      }
    };

    return {
      name: 'Protocol Buffers',
      aliases: ['proto'],
      keywords: {
        keyword: KEYWORDS,
        type: TYPES,
        literal: [
          'true',
          'false'
        ]
      },
      contains: [
        hljs.QUOTE_STRING_MODE,
        hljs.NUMBER_MODE,
        hljs.C_LINE_COMMENT_MODE,
        hljs.C_BLOCK_COMMENT_MODE,
        CLASS_DEFINITION,
        {
          className: 'function',
          beginKeywords: 'rpc',
          end: /[{;]/,
          excludeEnd: true,
          keywords: 'rpc returns'
        },
        { // match enum items (relevance)
          // BLAH = ...;
          begin: /^\s*[A-Z_]+(?=\s*=[^\n]+;$)/ }
      ]
    };
  }

  return protobuf;

})();

    hljs.registerLanguage('protobuf', hljsGrammar);
  })();/*! `python` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Python
  Description: Python is an interpreted, object-oriented, high-level programming language with dynamic semantics.
  Website: https://www.python.org
  Category: common
  */

  function python(hljs) {
    const regex = hljs.regex;
    const IDENT_RE = /[\p{XID_Start}_]\p{XID_Continue}*/u;
    const RESERVED_WORDS = [
      'and',
      'as',
      'assert',
      'async',
      'await',
      'break',
      'case',
      'class',
      'continue',
      'def',
      'del',
      'elif',
      'else',
      'except',
      'finally',
      'for',
      'from',
      'global',
      'if',
      'import',
      'in',
      'is',
      'lambda',
      'match',
      'nonlocal|10',
      'not',
      'or',
      'pass',
      'raise',
      'return',
      'try',
      'while',
      'with',
      'yield'
    ];

    const BUILT_INS = [
      '__import__',
      'abs',
      'all',
      'any',
      'ascii',
      'bin',
      'bool',
      'breakpoint',
      'bytearray',
      'bytes',
      'callable',
      'chr',
      'classmethod',
      'compile',
      'complex',
      'delattr',
      'dict',
      'dir',
      'divmod',
      'enumerate',
      'eval',
      'exec',
      'filter',
      'float',
      'format',
      'frozenset',
      'getattr',
      'globals',
      'hasattr',
      'hash',
      'help',
      'hex',
      'id',
      'input',
      'int',
      'isinstance',
      'issubclass',
      'iter',
      'len',
      'list',
      'locals',
      'map',
      'max',
      'memoryview',
      'min',
      'next',
      'object',
      'oct',
      'open',
      'ord',
      'pow',
      'print',
      'property',
      'range',
      'repr',
      'reversed',
      'round',
      'set',
      'setattr',
      'slice',
      'sorted',
      'staticmethod',
      'str',
      'sum',
      'super',
      'tuple',
      'type',
      'vars',
      'zip'
    ];

    const LITERALS = [
      '__debug__',
      'Ellipsis',
      'False',
      'None',
      'NotImplemented',
      'True'
    ];

    // https://docs.python.org/3/library/typing.html
    // TODO: Could these be supplemented by a CamelCase matcher in certain
    // contexts, leaving these remaining only for relevance hinting?
    const TYPES = [
      "Any",
      "Callable",
      "Coroutine",
      "Dict",
      "List",
      "Literal",
      "Generic",
      "Optional",
      "Sequence",
      "Set",
      "Tuple",
      "Type",
      "Union"
    ];

    const KEYWORDS = {
      $pattern: /[A-Za-z]\w+|__\w+__/,
      keyword: RESERVED_WORDS,
      built_in: BUILT_INS,
      literal: LITERALS,
      type: TYPES
    };

    const PROMPT = {
      className: 'meta',
      begin: /^(>>>|\.\.\.) /
    };

    const SUBST = {
      className: 'subst',
      begin: /\{/,
      end: /\}/,
      keywords: KEYWORDS,
      illegal: /#/
    };

    const LITERAL_BRACKET = {
      begin: /\{\{/,
      relevance: 0
    };

    const STRING = {
      className: 'string',
      contains: [ hljs.BACKSLASH_ESCAPE ],
      variants: [
        {
          begin: /([uU]|[bB]|[rR]|[bB][rR]|[rR][bB])?'''/,
          end: /'''/,
          contains: [
            hljs.BACKSLASH_ESCAPE,
            PROMPT
          ],
          relevance: 10
        },
        {
          begin: /([uU]|[bB]|[rR]|[bB][rR]|[rR][bB])?"""/,
          end: /"""/,
          contains: [
            hljs.BACKSLASH_ESCAPE,
            PROMPT
          ],
          relevance: 10
        },
        {
          begin: /([fF][rR]|[rR][fF]|[fF])'''/,
          end: /'''/,
          contains: [
            hljs.BACKSLASH_ESCAPE,
            PROMPT,
            LITERAL_BRACKET,
            SUBST
          ]
        },
        {
          begin: /([fF][rR]|[rR][fF]|[fF])"""/,
          end: /"""/,
          contains: [
            hljs.BACKSLASH_ESCAPE,
            PROMPT,
            LITERAL_BRACKET,
            SUBST
          ]
        },
        {
          begin: /([uU]|[rR])'/,
          end: /'/,
          relevance: 10
        },
        {
          begin: /([uU]|[rR])"/,
          end: /"/,
          relevance: 10
        },
        {
          begin: /([bB]|[bB][rR]|[rR][bB])'/,
          end: /'/
        },
        {
          begin: /([bB]|[bB][rR]|[rR][bB])"/,
          end: /"/
        },
        {
          begin: /([fF][rR]|[rR][fF]|[fF])'/,
          end: /'/,
          contains: [
            hljs.BACKSLASH_ESCAPE,
            LITERAL_BRACKET,
            SUBST
          ]
        },
        {
          begin: /([fF][rR]|[rR][fF]|[fF])"/,
          end: /"/,
          contains: [
            hljs.BACKSLASH_ESCAPE,
            LITERAL_BRACKET,
            SUBST
          ]
        },
        hljs.APOS_STRING_MODE,
        hljs.QUOTE_STRING_MODE
      ]
    };

    // https://docs.python.org/3.9/reference/lexical_analysis.html#numeric-literals
    const digitpart = '[0-9](_?[0-9])*';
    const pointfloat = `(\\b(${digitpart}))?\\.(${digitpart})|\\b(${digitpart})\\.`;
    // Whitespace after a number (or any lexical token) is needed only if its absence
    // would change the tokenization
    // https://docs.python.org/3.9/reference/lexical_analysis.html#whitespace-between-tokens
    // We deviate slightly, requiring a word boundary or a keyword
    // to avoid accidentally recognizing *prefixes* (e.g., `0` in `0x41` or `08` or `0__1`)
    const lookahead = `\\b|${RESERVED_WORDS.join('|')}`;
    const NUMBER = {
      className: 'number',
      relevance: 0,
      variants: [
        // exponentfloat, pointfloat
        // https://docs.python.org/3.9/reference/lexical_analysis.html#floating-point-literals
        // optionally imaginary
        // https://docs.python.org/3.9/reference/lexical_analysis.html#imaginary-literals
        // Note: no leading \b because floats can start with a decimal point
        // and we don't want to mishandle e.g. `fn(.5)`,
        // no trailing \b for pointfloat because it can end with a decimal point
        // and we don't want to mishandle e.g. `0..hex()`; this should be safe
        // because both MUST contain a decimal point and so cannot be confused with
        // the interior part of an identifier
        {
          begin: `(\\b(${digitpart})|(${pointfloat}))[eE][+-]?(${digitpart})[jJ]?(?=${lookahead})`
        },
        {
          begin: `(${pointfloat})[jJ]?`
        },

        // decinteger, bininteger, octinteger, hexinteger
        // https://docs.python.org/3.9/reference/lexical_analysis.html#integer-literals
        // optionally "long" in Python 2
        // https://docs.python.org/2.7/reference/lexical_analysis.html#integer-and-long-integer-literals
        // decinteger is optionally imaginary
        // https://docs.python.org/3.9/reference/lexical_analysis.html#imaginary-literals
        {
          begin: `\\b([1-9](_?[0-9])*|0+(_?0)*)[lLjJ]?(?=${lookahead})`
        },
        {
          begin: `\\b0[bB](_?[01])+[lL]?(?=${lookahead})`
        },
        {
          begin: `\\b0[oO](_?[0-7])+[lL]?(?=${lookahead})`
        },
        {
          begin: `\\b0[xX](_?[0-9a-fA-F])+[lL]?(?=${lookahead})`
        },

        // imagnumber (digitpart-based)
        // https://docs.python.org/3.9/reference/lexical_analysis.html#imaginary-literals
        {
          begin: `\\b(${digitpart})[jJ](?=${lookahead})`
        }
      ]
    };
    const COMMENT_TYPE = {
      className: "comment",
      begin: regex.lookahead(/# type:/),
      end: /$/,
      keywords: KEYWORDS,
      contains: [
        { // prevent keywords from coloring `type`
          begin: /# type:/
        },
        // comment within a datatype comment includes no keywords
        {
          begin: /#/,
          end: /\b\B/,
          endsWithParent: true
        }
      ]
    };
    const PARAMS = {
      className: 'params',
      variants: [
        // Exclude params in functions without params
        {
          className: "",
          begin: /\(\s*\)/,
          skip: true
        },
        {
          begin: /\(/,
          end: /\)/,
          excludeBegin: true,
          excludeEnd: true,
          keywords: KEYWORDS,
          contains: [
            'self',
            PROMPT,
            NUMBER,
            STRING,
            hljs.HASH_COMMENT_MODE
          ]
        }
      ]
    };
    SUBST.contains = [
      STRING,
      NUMBER,
      PROMPT
    ];

    return {
      name: 'Python',
      aliases: [
        'py',
        'gyp',
        'ipython'
      ],
      unicodeRegex: true,
      keywords: KEYWORDS,
      illegal: /(<\/|\?)|=>/,
      contains: [
        PROMPT,
        NUMBER,
        {
          // very common convention
          scope: 'variable.language',
          match: /\bself\b/
        },
        {
          // eat "if" prior to string so that it won't accidentally be
          // labeled as an f-string
          beginKeywords: "if",
          relevance: 0
        },
        { match: /\bor\b/, scope: "keyword" },
        STRING,
        COMMENT_TYPE,
        hljs.HASH_COMMENT_MODE,
        {
          match: [
            /\bdef/, /\s+/,
            IDENT_RE,
          ],
          scope: {
            1: "keyword",
            3: "title.function"
          },
          contains: [ PARAMS ]
        },
        {
          variants: [
            {
              match: [
                /\bclass/, /\s+/,
                IDENT_RE, /\s*/,
                /\(\s*/, IDENT_RE,/\s*\)/
              ],
            },
            {
              match: [
                /\bclass/, /\s+/,
                IDENT_RE
              ],
            }
          ],
          scope: {
            1: "keyword",
            3: "title.class",
            6: "title.class.inherited",
          }
        },
        {
          className: 'meta',
          begin: /^[\t ]*@/,
          end: /(?=#)|$/,
          contains: [
            NUMBER,
            PARAMS,
            STRING
          ]
        }
      ]
    };
  }

  return python;

})();

    hljs.registerLanguage('python', hljsGrammar);
  })();/*! `python-repl` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Python REPL
  Requires: python.js
  Author: Josh Goebel <hello@joshgoebel.com>
  Category: common
  */

  function pythonRepl(hljs) {
    return {
      aliases: [ 'pycon' ],
      contains: [
        {
          className: 'meta.prompt',
          starts: {
            // a space separates the REPL prefix from the actual code
            // this is purely for cleaner HTML output
            end: / |$/,
            starts: {
              end: '$',
              subLanguage: 'python'
            }
          },
          variants: [
            { begin: /^>>>(?=[ ]|$)/ },
            { begin: /^\.\.\.(?=[ ]|$)/ }
          ]
        }
      ]
    };
  }

  return pythonRepl;

})();

    hljs.registerLanguage('python-repl', hljsGrammar);
  })();/*! `r` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: R
  Description: R is a free software environment for statistical computing and graphics.
  Author: Joe Cheng <joe@rstudio.org>
  Contributors: Konrad Rudolph <konrad.rudolph@gmail.com>
  Website: https://www.r-project.org
  Category: common,scientific
  */

  /** @type LanguageFn */
  function r(hljs) {
    const regex = hljs.regex;
    // Identifiers in R cannot start with `_`, but they can start with `.` if it
    // is not immediately followed by a digit.
    // R also supports quoted identifiers, which are near-arbitrary sequences
    // delimited by backticks (`…`), which may contain escape sequences. These are
    // handled in a separate mode. See `test/markup/r/names.txt` for examples.
    // FIXME: Support Unicode identifiers.
    const IDENT_RE = /(?:(?:[a-zA-Z]|\.[._a-zA-Z])[._a-zA-Z0-9]*)|\.(?!\d)/;
    const NUMBER_TYPES_RE = regex.either(
      // Special case: only hexadecimal binary powers can contain fractions
      /0[xX][0-9a-fA-F]+\.[0-9a-fA-F]*[pP][+-]?\d+i?/,
      // Hexadecimal numbers without fraction and optional binary power
      /0[xX][0-9a-fA-F]+(?:[pP][+-]?\d+)?[Li]?/,
      // Decimal numbers
      /(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?[Li]?/
    );
    const OPERATORS_RE = /[=!<>:]=|\|\||&&|:::?|<-|<<-|->>|->|\|>|[-+*\/?!$&|:<=>@^~]|\*\*/;
    const PUNCTUATION_RE = regex.either(
      /[()]/,
      /[{}]/,
      /\[\[/,
      /[[\]]/,
      /\\/,
      /,/
    );

    return {
      name: 'R',

      keywords: {
        $pattern: IDENT_RE,
        keyword:
          'function if in break next repeat else for while',
        literal:
          'NULL NA TRUE FALSE Inf NaN NA_integer_|10 NA_real_|10 '
          + 'NA_character_|10 NA_complex_|10',
        built_in:
          // Builtin constants
          'LETTERS letters month.abb month.name pi T F '
          // Primitive functions
          // These are all the functions in `base` that are implemented as a
          // `.Primitive`, minus those functions that are also keywords.
          + 'abs acos acosh all any anyNA Arg as.call as.character '
          + 'as.complex as.double as.environment as.integer as.logical '
          + 'as.null.default as.numeric as.raw asin asinh atan atanh attr '
          + 'attributes baseenv browser c call ceiling class Conj cos cosh '
          + 'cospi cummax cummin cumprod cumsum digamma dim dimnames '
          + 'emptyenv exp expression floor forceAndCall gamma gc.time '
          + 'globalenv Im interactive invisible is.array is.atomic is.call '
          + 'is.character is.complex is.double is.environment is.expression '
          + 'is.finite is.function is.infinite is.integer is.language '
          + 'is.list is.logical is.matrix is.na is.name is.nan is.null '
          + 'is.numeric is.object is.pairlist is.raw is.recursive is.single '
          + 'is.symbol lazyLoadDBfetch length lgamma list log max min '
          + 'missing Mod names nargs nzchar oldClass on.exit pos.to.env '
          + 'proc.time prod quote range Re rep retracemem return round '
          + 'seq_along seq_len seq.int sign signif sin sinh sinpi sqrt '
          + 'standardGeneric substitute sum switch tan tanh tanpi tracemem '
          + 'trigamma trunc unclass untracemem UseMethod xtfrm',
      },

      contains: [
        // Roxygen comments
        hljs.COMMENT(
          /#'/,
          /$/,
          { contains: [
            {
              // Handle `@examples` separately to cause all subsequent code
              // until the next `@`-tag on its own line to be kept as-is,
              // preventing highlighting. This code is example R code, so nested
              // doctags shouldn’t be treated as such. See
              // `test/markup/r/roxygen.txt` for an example.
              scope: 'doctag',
              match: /@examples/,
              starts: {
                end: regex.lookahead(regex.either(
                  // end if another doc comment
                  /\n^#'\s*(?=@[a-zA-Z]+)/,
                  // or a line with no comment
                  /\n^(?!#')/
                )),
                endsParent: true
              }
            },
            {
              // Handle `@param` to highlight the parameter name following
              // after.
              scope: 'doctag',
              begin: '@param',
              end: /$/,
              contains: [
                {
                  scope: 'variable',
                  variants: [
                    { match: IDENT_RE },
                    { match: /`(?:\\.|[^`\\])+`/ }
                  ],
                  endsParent: true
                }
              ]
            },
            {
              scope: 'doctag',
              match: /@[a-zA-Z]+/
            },
            {
              scope: 'keyword',
              match: /\\[a-zA-Z]+/
            }
          ] }
        ),

        hljs.HASH_COMMENT_MODE,

        {
          scope: 'string',
          contains: [ hljs.BACKSLASH_ESCAPE ],
          variants: [
            hljs.END_SAME_AS_BEGIN({
              begin: /[rR]"(-*)\(/,
              end: /\)(-*)"/
            }),
            hljs.END_SAME_AS_BEGIN({
              begin: /[rR]"(-*)\{/,
              end: /\}(-*)"/
            }),
            hljs.END_SAME_AS_BEGIN({
              begin: /[rR]"(-*)\[/,
              end: /\](-*)"/
            }),
            hljs.END_SAME_AS_BEGIN({
              begin: /[rR]'(-*)\(/,
              end: /\)(-*)'/
            }),
            hljs.END_SAME_AS_BEGIN({
              begin: /[rR]'(-*)\{/,
              end: /\}(-*)'/
            }),
            hljs.END_SAME_AS_BEGIN({
              begin: /[rR]'(-*)\[/,
              end: /\](-*)'/
            }),
            {
              begin: '"',
              end: '"',
              relevance: 0
            },
            {
              begin: "'",
              end: "'",
              relevance: 0
            }
          ],
        },

        // Matching numbers immediately following punctuation and operators is
        // tricky since we need to look at the character ahead of a number to
        // ensure the number is not part of an identifier, and we cannot use
        // negative look-behind assertions. So instead we explicitly handle all
        // possible combinations of (operator|punctuation), number.
        // TODO: replace with negative look-behind when available
        // { begin: /(?<![a-zA-Z0-9._])0[xX][0-9a-fA-F]+\.[0-9a-fA-F]*[pP][+-]?\d+i?/ },
        // { begin: /(?<![a-zA-Z0-9._])0[xX][0-9a-fA-F]+([pP][+-]?\d+)?[Li]?/ },
        // { begin: /(?<![a-zA-Z0-9._])(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?[Li]?/ }
        {
          relevance: 0,
          variants: [
            {
              scope: {
                1: 'operator',
                2: 'number'
              },
              match: [
                OPERATORS_RE,
                NUMBER_TYPES_RE
              ]
            },
            {
              scope: {
                1: 'operator',
                2: 'number'
              },
              match: [
                /%[^%]*%/,
                NUMBER_TYPES_RE
              ]
            },
            {
              scope: {
                1: 'punctuation',
                2: 'number'
              },
              match: [
                PUNCTUATION_RE,
                NUMBER_TYPES_RE
              ]
            },
            {
              scope: { 2: 'number' },
              match: [
                /[^a-zA-Z0-9._]|^/, // not part of an identifier, or start of document
                NUMBER_TYPES_RE
              ]
            }
          ]
        },

        // Operators/punctuation when they're not directly followed by numbers
        {
          // Relevance boost for the most common assignment form.
          scope: { 3: 'operator' },
          match: [
            IDENT_RE,
            /\s+/,
            /<-/,
            /\s+/
          ]
        },

        {
          scope: 'operator',
          relevance: 0,
          variants: [
            { match: OPERATORS_RE },
            { match: /%[^%]*%/ }
          ]
        },

        {
          scope: 'punctuation',
          relevance: 0,
          match: PUNCTUATION_RE
        },

        {
          // Escaped identifier
          begin: '`',
          end: '`',
          contains: [ { begin: /\\./ } ]
        }
      ]
    };
  }

  return r;

})();

    hljs.registerLanguage('r', hljsGrammar);
  })();/*! `ruby` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Ruby
  Description: Ruby is a dynamic, open source programming language with a focus on simplicity and productivity.
  Website: https://www.ruby-lang.org/
  Author: Anton Kovalyov <anton@kovalyov.net>
  Contributors: Peter Leonov <gojpeg@yandex.ru>, Vasily Polovnyov <vast@whiteants.net>, Loren Segal <lsegal@soen.ca>, Pascal Hurni <phi@ruby-reactive.org>, Cedric Sohrauer <sohrauer@googlemail.com>
  Category: common, scripting
  */

  function ruby(hljs) {
    const regex = hljs.regex;
    const RUBY_METHOD_RE = '([a-zA-Z_]\\w*[!?=]?|[-+~]@|<<|>>|=~|===?|<=>|[<>]=?|\\*\\*|[-/+%^&*~`|]|\\[\\]=?)';
    // TODO: move concepts like CAMEL_CASE into `modes.js`
    const CLASS_NAME_RE = regex.either(
      /\b([A-Z]+[a-z0-9]+)+/,
      // ends in caps
      /\b([A-Z]+[a-z0-9]+)+[A-Z]+/,
    )
    ;
    const CLASS_NAME_WITH_NAMESPACE_RE = regex.concat(CLASS_NAME_RE, /(::\w+)*/);
    // very popular ruby built-ins that one might even assume
    // are actual keywords (despite that not being the case)
    const PSEUDO_KWS = [
      "include",
      "extend",
      "prepend",
      "public",
      "private",
      "protected",
      "raise",
      "throw"
    ];
    const RUBY_KEYWORDS = {
      "variable.constant": [
        "__FILE__",
        "__LINE__",
        "__ENCODING__"
      ],
      "variable.language": [
        "self",
        "super",
      ],
      keyword: [
        "alias",
        "and",
        "begin",
        "BEGIN",
        "break",
        "case",
        "class",
        "defined",
        "do",
        "else",
        "elsif",
        "end",
        "END",
        "ensure",
        "for",
        "if",
        "in",
        "module",
        "next",
        "not",
        "or",
        "redo",
        "require",
        "rescue",
        "retry",
        "return",
        "then",
        "undef",
        "unless",
        "until",
        "when",
        "while",
        "yield",
        ...PSEUDO_KWS
      ],
      built_in: [
        "proc",
        "lambda",
        "attr_accessor",
        "attr_reader",
        "attr_writer",
        "define_method",
        "private_constant",
        "module_function"
      ],
      literal: [
        "true",
        "false",
        "nil"
      ]
    };
    const YARDOCTAG = {
      className: 'doctag',
      begin: '@[A-Za-z]+'
    };
    const IRB_OBJECT = {
      begin: '#<',
      end: '>'
    };
    const COMMENT_MODES = [
      hljs.COMMENT(
        '#',
        '$',
        { contains: [ YARDOCTAG ] }
      ),
      hljs.COMMENT(
        '^=begin',
        '^=end',
        {
          contains: [ YARDOCTAG ],
          relevance: 10
        }
      ),
      hljs.COMMENT('^__END__', hljs.MATCH_NOTHING_RE)
    ];
    const SUBST = {
      className: 'subst',
      begin: /#\{/,
      end: /\}/,
      keywords: RUBY_KEYWORDS
    };
    const STRING = {
      className: 'string',
      contains: [
        hljs.BACKSLASH_ESCAPE,
        SUBST
      ],
      variants: [
        {
          begin: /'/,
          end: /'/
        },
        {
          begin: /"/,
          end: /"/
        },
        {
          begin: /`/,
          end: /`/
        },
        {
          begin: /%[qQwWx]?\(/,
          end: /\)/
        },
        {
          begin: /%[qQwWx]?\[/,
          end: /\]/
        },
        {
          begin: /%[qQwWx]?\{/,
          end: /\}/
        },
        {
          begin: /%[qQwWx]?</,
          end: />/
        },
        {
          begin: /%[qQwWx]?\//,
          end: /\//
        },
        {
          begin: /%[qQwWx]?%/,
          end: /%/
        },
        {
          begin: /%[qQwWx]?-/,
          end: /-/
        },
        {
          begin: /%[qQwWx]?\|/,
          end: /\|/
        },
        // in the following expressions, \B in the beginning suppresses recognition of ?-sequences
        // where ? is the last character of a preceding identifier, as in: `func?4`
        { begin: /\B\?(\\\d{1,3})/ },
        { begin: /\B\?(\\x[A-Fa-f0-9]{1,2})/ },
        { begin: /\B\?(\\u\{?[A-Fa-f0-9]{1,6}\}?)/ },
        { begin: /\B\?(\\M-\\C-|\\M-\\c|\\c\\M-|\\M-|\\C-\\M-)[\x20-\x7e]/ },
        { begin: /\B\?\\(c|C-)[\x20-\x7e]/ },
        { begin: /\B\?\\?\S/ },
        // heredocs
        {
          // this guard makes sure that we have an entire heredoc and not a false
          // positive (auto-detect, etc.)
          begin: regex.concat(
            /<<[-~]?'?/,
            regex.lookahead(/(\w+)(?=\W)[^\n]*\n(?:[^\n]*\n)*?\s*\1\b/)
          ),
          contains: [
            hljs.END_SAME_AS_BEGIN({
              begin: /(\w+)/,
              end: /(\w+)/,
              contains: [
                hljs.BACKSLASH_ESCAPE,
                SUBST
              ]
            })
          ]
        }
      ]
    };

    // Ruby syntax is underdocumented, but this grammar seems to be accurate
    // as of version 2.7.2 (confirmed with (irb and `Ripper.sexp(...)`)
    // https://docs.ruby-lang.org/en/2.7.0/doc/syntax/literals_rdoc.html#label-Numbers
    const decimal = '[1-9](_?[0-9])*|0';
    const digits = '[0-9](_?[0-9])*';
    const NUMBER = {
      className: 'number',
      relevance: 0,
      variants: [
        // decimal integer/float, optionally exponential or rational, optionally imaginary
        { begin: `\\b(${decimal})(\\.(${digits}))?([eE][+-]?(${digits})|r)?i?\\b` },

        // explicit decimal/binary/octal/hexadecimal integer,
        // optionally rational and/or imaginary
        { begin: "\\b0[dD][0-9](_?[0-9])*r?i?\\b" },
        { begin: "\\b0[bB][0-1](_?[0-1])*r?i?\\b" },
        { begin: "\\b0[oO][0-7](_?[0-7])*r?i?\\b" },
        { begin: "\\b0[xX][0-9a-fA-F](_?[0-9a-fA-F])*r?i?\\b" },

        // 0-prefixed implicit octal integer, optionally rational and/or imaginary
        { begin: "\\b0(_?[0-7])+r?i?\\b" }
      ]
    };

    const PARAMS = {
      variants: [
        {
          match: /\(\)/,
        },
        {
          className: 'params',
          begin: /\(/,
          end: /(?=\))/,
          excludeBegin: true,
          endsParent: true,
          keywords: RUBY_KEYWORDS,
        }
      ]
    };

    const INCLUDE_EXTEND = {
      match: [
        /(include|extend)\s+/,
        CLASS_NAME_WITH_NAMESPACE_RE
      ],
      scope: {
        2: "title.class"
      },
      keywords: RUBY_KEYWORDS
    };

    const CLASS_DEFINITION = {
      variants: [
        {
          match: [
            /class\s+/,
            CLASS_NAME_WITH_NAMESPACE_RE,
            /\s+<\s+/,
            CLASS_NAME_WITH_NAMESPACE_RE
          ]
        },
        {
          match: [
            /\b(class|module)\s+/,
            CLASS_NAME_WITH_NAMESPACE_RE
          ]
        }
      ],
      scope: {
        2: "title.class",
        4: "title.class.inherited"
      },
      keywords: RUBY_KEYWORDS
    };

    const UPPER_CASE_CONSTANT = {
      relevance: 0,
      match: /\b[A-Z][A-Z_0-9]+\b/,
      className: "variable.constant"
    };

    const METHOD_DEFINITION = {
      match: [
        /def/, /\s+/,
        RUBY_METHOD_RE
      ],
      scope: {
        1: "keyword",
        3: "title.function"
      },
      contains: [
        PARAMS
      ]
    };

    const OBJECT_CREATION = {
      relevance: 0,
      match: [
        CLASS_NAME_WITH_NAMESPACE_RE,
        /\.new[. (]/
      ],
      scope: {
        1: "title.class"
      }
    };

    // CamelCase
    const CLASS_REFERENCE = {
      relevance: 0,
      match: CLASS_NAME_RE,
      scope: "title.class"
    };

    const RUBY_DEFAULT_CONTAINS = [
      STRING,
      CLASS_DEFINITION,
      INCLUDE_EXTEND,
      OBJECT_CREATION,
      UPPER_CASE_CONSTANT,
      CLASS_REFERENCE,
      METHOD_DEFINITION,
      {
        // swallow namespace qualifiers before symbols
        begin: hljs.IDENT_RE + '::' },
      {
        className: 'symbol',
        begin: hljs.UNDERSCORE_IDENT_RE + '(!|\\?)?:',
        relevance: 0
      },
      {
        className: 'symbol',
        begin: ':(?!\\s)',
        contains: [
          STRING,
          { begin: RUBY_METHOD_RE }
        ],
        relevance: 0
      },
      NUMBER,
      {
        // negative-look forward attempts to prevent false matches like:
        // @ident@ or $ident$ that might indicate this is not ruby at all
        className: "variable",
        begin: '(\\$\\W)|((\\$|@@?)(\\w+))(?=[^@$?])' + `(?![A-Za-z])(?![@$?'])`
      },
      {
        className: 'params',
        begin: /\|(?!=)/,
        end: /\|/,
        excludeBegin: true,
        excludeEnd: true,
        relevance: 0, // this could be a lot of things (in other languages) other than params
        keywords: RUBY_KEYWORDS
      },
      { // regexp container
        begin: '(' + hljs.RE_STARTERS_RE + '|unless)\\s*',
        keywords: 'unless',
        contains: [
          {
            className: 'regexp',
            contains: [
              hljs.BACKSLASH_ESCAPE,
              SUBST
            ],
            illegal: /\n/,
            variants: [
              {
                begin: '/',
                end: '/[a-z]*'
              },
              {
                begin: /%r\{/,
                end: /\}[a-z]*/
              },
              {
                begin: '%r\\(',
                end: '\\)[a-z]*'
              },
              {
                begin: '%r!',
                end: '![a-z]*'
              },
              {
                begin: '%r\\[',
                end: '\\][a-z]*'
              }
            ]
          }
        ].concat(IRB_OBJECT, COMMENT_MODES),
        relevance: 0
      }
    ].concat(IRB_OBJECT, COMMENT_MODES);

    SUBST.contains = RUBY_DEFAULT_CONTAINS;
    PARAMS.contains = RUBY_DEFAULT_CONTAINS;

    // >>
    // ?>
    const SIMPLE_PROMPT = "[>?]>";
    // irb(main):001:0>
    const DEFAULT_PROMPT = "[\\w#]+\\(\\w+\\):\\d+:\\d+[>*]";
    const RVM_PROMPT = "(\\w+-)?\\d+\\.\\d+\\.\\d+(p\\d+)?[^\\d][^>]+>";

    const IRB_DEFAULT = [
      {
        begin: /^\s*=>/,
        starts: {
          end: '$',
          contains: RUBY_DEFAULT_CONTAINS
        }
      },
      {
        className: 'meta.prompt',
        begin: '^(' + SIMPLE_PROMPT + "|" + DEFAULT_PROMPT + '|' + RVM_PROMPT + ')(?=[ ])',
        starts: {
          end: '$',
          keywords: RUBY_KEYWORDS,
          contains: RUBY_DEFAULT_CONTAINS
        }
      }
    ];

    COMMENT_MODES.unshift(IRB_OBJECT);

    return {
      name: 'Ruby',
      aliases: [
        'rb',
        'gemspec',
        'podspec',
        'thor',
        'irb'
      ],
      keywords: RUBY_KEYWORDS,
      illegal: /\/\*/,
      contains: [ hljs.SHEBANG({ binary: "ruby" }) ]
        .concat(IRB_DEFAULT)
        .concat(COMMENT_MODES)
        .concat(RUBY_DEFAULT_CONTAINS)
    };
  }

  return ruby;

})();

    hljs.registerLanguage('ruby', hljsGrammar);
  })();/*! `rust` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Rust
  Author: Andrey Vlasovskikh <andrey.vlasovskikh@gmail.com>
  Contributors: Roman Shmatov <romanshmatov@gmail.com>, Kasper Andersen <kma_untrusted@protonmail.com>
  Website: https://www.rust-lang.org
  Category: common, system
  */

  /** @type LanguageFn */

  function rust(hljs) {
    const regex = hljs.regex;
    // ============================================
    // Added to support the r# keyword, which is a raw identifier in Rust.
    const RAW_IDENTIFIER = /(r#)?/;
    const UNDERSCORE_IDENT_RE = regex.concat(RAW_IDENTIFIER, hljs.UNDERSCORE_IDENT_RE);
    const IDENT_RE = regex.concat(RAW_IDENTIFIER, hljs.IDENT_RE);
    // ============================================
    const FUNCTION_INVOKE = {
      className: "title.function.invoke",
      relevance: 0,
      begin: regex.concat(
        /\b/,
        /(?!let|for|while|if|else|match\b)/,
        IDENT_RE,
        regex.lookahead(/\s*\(/))
    };
    const NUMBER_SUFFIX = '([ui](8|16|32|64|128|size)|f(32|64))\?';
    const KEYWORDS = [
      "abstract",
      "as",
      "async",
      "await",
      "become",
      "box",
      "break",
      "const",
      "continue",
      "crate",
      "do",
      "dyn",
      "else",
      "enum",
      "extern",
      "false",
      "final",
      "fn",
      "for",
      "if",
      "impl",
      "in",
      "let",
      "loop",
      "macro",
      "match",
      "mod",
      "move",
      "mut",
      "override",
      "priv",
      "pub",
      "ref",
      "return",
      "self",
      "Self",
      "static",
      "struct",
      "super",
      "trait",
      "true",
      "try",
      "type",
      "typeof",
      "union",
      "unsafe",
      "unsized",
      "use",
      "virtual",
      "where",
      "while",
      "yield"
    ];
    const LITERALS = [
      "true",
      "false",
      "Some",
      "None",
      "Ok",
      "Err"
    ];
    const BUILTINS = [
      // functions
      'drop ',
      // traits
      "Copy",
      "Send",
      "Sized",
      "Sync",
      "Drop",
      "Fn",
      "FnMut",
      "FnOnce",
      "ToOwned",
      "Clone",
      "Debug",
      "PartialEq",
      "PartialOrd",
      "Eq",
      "Ord",
      "AsRef",
      "AsMut",
      "Into",
      "From",
      "Default",
      "Iterator",
      "Extend",
      "IntoIterator",
      "DoubleEndedIterator",
      "ExactSizeIterator",
      "SliceConcatExt",
      "ToString",
      // macros
      "assert!",
      "assert_eq!",
      "bitflags!",
      "bytes!",
      "cfg!",
      "col!",
      "concat!",
      "concat_idents!",
      "debug_assert!",
      "debug_assert_eq!",
      "env!",
      "eprintln!",
      "panic!",
      "file!",
      "format!",
      "format_args!",
      "include_bytes!",
      "include_str!",
      "line!",
      "local_data_key!",
      "module_path!",
      "option_env!",
      "print!",
      "println!",
      "select!",
      "stringify!",
      "try!",
      "unimplemented!",
      "unreachable!",
      "vec!",
      "write!",
      "writeln!",
      "macro_rules!",
      "assert_ne!",
      "debug_assert_ne!"
    ];
    const TYPES = [
      "i8",
      "i16",
      "i32",
      "i64",
      "i128",
      "isize",
      "u8",
      "u16",
      "u32",
      "u64",
      "u128",
      "usize",
      "f32",
      "f64",
      "str",
      "char",
      "bool",
      "Box",
      "Option",
      "Result",
      "String",
      "Vec"
    ];
    return {
      name: 'Rust',
      aliases: [ 'rs' ],
      keywords: {
        $pattern: hljs.IDENT_RE + '!?',
        type: TYPES,
        keyword: KEYWORDS,
        literal: LITERALS,
        built_in: BUILTINS
      },
      illegal: '</',
      contains: [
        hljs.C_LINE_COMMENT_MODE,
        hljs.COMMENT('/\\*', '\\*/', { contains: [ 'self' ] }),
        hljs.inherit(hljs.QUOTE_STRING_MODE, {
          begin: /b?"/,
          illegal: null
        }),
        {
          className: 'symbol',
          // negative lookahead to avoid matching `'`
          begin: /'[a-zA-Z_][a-zA-Z0-9_]*(?!')/
        },
        {
          scope: 'string',
          variants: [
            { begin: /b?r(#*)"(.|\n)*?"\1(?!#)/ },
            {
              begin: /b?'/,
              end: /'/,
              contains: [
                {
                  scope: "char.escape",
                  match: /\\('|\w|x\w{2}|u\w{4}|U\w{8})/
                }
              ]
            }
          ]
        },
        {
          className: 'number',
          variants: [
            { begin: '\\b0b([01_]+)' + NUMBER_SUFFIX },
            { begin: '\\b0o([0-7_]+)' + NUMBER_SUFFIX },
            { begin: '\\b0x([A-Fa-f0-9_]+)' + NUMBER_SUFFIX },
            { begin: '\\b(\\d[\\d_]*(\\.[0-9_]+)?([eE][+-]?[0-9_]+)?)'
                     + NUMBER_SUFFIX }
          ],
          relevance: 0
        },
        {
          begin: [
            /fn/,
            /\s+/,
            UNDERSCORE_IDENT_RE
          ],
          className: {
            1: "keyword",
            3: "title.function"
          }
        },
        {
          className: 'meta',
          begin: '#!?\\[',
          end: '\\]',
          contains: [
            {
              className: 'string',
              begin: /"/,
              end: /"/,
              contains: [
                hljs.BACKSLASH_ESCAPE
              ]
            }
          ]
        },
        {
          begin: [
            /let/,
            /\s+/,
            /(?:mut\s+)?/,
            UNDERSCORE_IDENT_RE
          ],
          className: {
            1: "keyword",
            3: "keyword",
            4: "variable"
          }
        },
        // must come before impl/for rule later
        {
          begin: [
            /for/,
            /\s+/,
            UNDERSCORE_IDENT_RE,
            /\s+/,
            /in/
          ],
          className: {
            1: "keyword",
            3: "variable",
            5: "keyword"
          }
        },
        {
          begin: [
            /type/,
            /\s+/,
            UNDERSCORE_IDENT_RE
          ],
          className: {
            1: "keyword",
            3: "title.class"
          }
        },
        {
          begin: [
            /(?:trait|enum|struct|union|impl|for)/,
            /\s+/,
            UNDERSCORE_IDENT_RE
          ],
          className: {
            1: "keyword",
            3: "title.class"
          }
        },
        {
          begin: hljs.IDENT_RE + '::',
          keywords: {
            keyword: "Self",
            built_in: BUILTINS,
            type: TYPES
          }
        },
        {
          className: "punctuation",
          begin: '->'
        },
        FUNCTION_INVOKE
      ]
    };
  }

  return rust;

})();

    hljs.registerLanguage('rust', hljsGrammar);
  })();/*! `scheme` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Scheme
  Description: Scheme is a programming language in the Lisp family.
               (keywords based on http://community.schemewiki.org/?scheme-keywords)
  Author: JP Verkamp <me@jverkamp.com>
  Contributors: Ivan Sagalaev <maniac@softwaremaniacs.org>
  Origin: clojure.js
  Website: http://community.schemewiki.org/?what-is-scheme
  Category: lisp
  */

  function scheme(hljs) {
    const SCHEME_IDENT_RE = '[^\\(\\)\\[\\]\\{\\}",\'`;#|\\\\\\s]+';
    const SCHEME_SIMPLE_NUMBER_RE = '(-|\\+)?\\d+([./]\\d+)?';
    const SCHEME_COMPLEX_NUMBER_RE = SCHEME_SIMPLE_NUMBER_RE + '[+\\-]' + SCHEME_SIMPLE_NUMBER_RE + 'i';
    const KEYWORDS = {
      $pattern: SCHEME_IDENT_RE,
      built_in:
        'case-lambda call/cc class define-class exit-handler field import '
        + 'inherit init-field interface let*-values let-values let/ec mixin '
        + 'opt-lambda override protect provide public rename require '
        + 'require-for-syntax syntax syntax-case syntax-error unit/sig unless '
        + 'when with-syntax and begin call-with-current-continuation '
        + 'call-with-input-file call-with-output-file case cond define '
        + 'define-syntax delay do dynamic-wind else for-each if lambda let let* '
        + 'let-syntax letrec letrec-syntax map or syntax-rules \' * + , ,@ - ... / '
        + '; < <= = => > >= ` abs acos angle append apply asin assoc assq assv atan '
        + 'boolean? caar cadr call-with-input-file call-with-output-file '
        + 'call-with-values car cdddar cddddr cdr ceiling char->integer '
        + 'char-alphabetic? char-ci<=? char-ci<? char-ci=? char-ci>=? char-ci>? '
        + 'char-downcase char-lower-case? char-numeric? char-ready? char-upcase '
        + 'char-upper-case? char-whitespace? char<=? char<? char=? char>=? char>? '
        + 'char? close-input-port close-output-port complex? cons cos '
        + 'current-input-port current-output-port denominator display eof-object? '
        + 'eq? equal? eqv? eval even? exact->inexact exact? exp expt floor '
        + 'force gcd imag-part inexact->exact inexact? input-port? integer->char '
        + 'integer? interaction-environment lcm length list list->string '
        + 'list->vector list-ref list-tail list? load log magnitude make-polar '
        + 'make-rectangular make-string make-vector max member memq memv min '
        + 'modulo negative? newline not null-environment null? number->string '
        + 'number? numerator odd? open-input-file open-output-file output-port? '
        + 'pair? peek-char port? positive? procedure? quasiquote quote quotient '
        + 'rational? rationalize read read-char real-part real? remainder reverse '
        + 'round scheme-report-environment set! set-car! set-cdr! sin sqrt string '
        + 'string->list string->number string->symbol string-append string-ci<=? '
        + 'string-ci<? string-ci=? string-ci>=? string-ci>? string-copy '
        + 'string-fill! string-length string-ref string-set! string<=? string<? '
        + 'string=? string>=? string>? string? substring symbol->string symbol? '
        + 'tan transcript-off transcript-on truncate values vector '
        + 'vector->list vector-fill! vector-length vector-ref vector-set! '
        + 'with-input-from-file with-output-to-file write write-char zero?'
    };

    const LITERAL = {
      className: 'literal',
      begin: '(#t|#f|#\\\\' + SCHEME_IDENT_RE + '|#\\\\.)'
    };

    const NUMBER = {
      className: 'number',
      variants: [
        {
          begin: SCHEME_SIMPLE_NUMBER_RE,
          relevance: 0
        },
        {
          begin: SCHEME_COMPLEX_NUMBER_RE,
          relevance: 0
        },
        { begin: '#b[0-1]+(/[0-1]+)?' },
        { begin: '#o[0-7]+(/[0-7]+)?' },
        { begin: '#x[0-9a-f]+(/[0-9a-f]+)?' }
      ]
    };

    const STRING = hljs.QUOTE_STRING_MODE;

    const COMMENT_MODES = [
      hljs.COMMENT(
        ';',
        '$',
        { relevance: 0 }
      ),
      hljs.COMMENT('#\\|', '\\|#')
    ];

    const IDENT = {
      begin: SCHEME_IDENT_RE,
      relevance: 0
    };

    const QUOTED_IDENT = {
      className: 'symbol',
      begin: '\'' + SCHEME_IDENT_RE
    };

    const BODY = {
      endsWithParent: true,
      relevance: 0
    };

    const QUOTED_LIST = {
      variants: [
        { begin: /'/ },
        { begin: '`' }
      ],
      contains: [
        {
          begin: '\\(',
          end: '\\)',
          contains: [
            'self',
            LITERAL,
            STRING,
            NUMBER,
            IDENT,
            QUOTED_IDENT
          ]
        }
      ]
    };

    const NAME = {
      className: 'name',
      relevance: 0,
      begin: SCHEME_IDENT_RE,
      keywords: KEYWORDS
    };

    const LAMBDA = {
      begin: /lambda/,
      endsWithParent: true,
      returnBegin: true,
      contains: [
        NAME,
        {
          endsParent: true,
          variants: [
            {
              begin: /\(/,
              end: /\)/
            },
            {
              begin: /\[/,
              end: /\]/
            }
          ],
          contains: [ IDENT ]
        }
      ]
    };

    const LIST = {
      variants: [
        {
          begin: '\\(',
          end: '\\)'
        },
        {
          begin: '\\[',
          end: '\\]'
        }
      ],
      contains: [
        LAMBDA,
        NAME,
        BODY
      ]
    };

    BODY.contains = [
      LITERAL,
      NUMBER,
      STRING,
      IDENT,
      QUOTED_IDENT,
      QUOTED_LIST,
      LIST
    ].concat(COMMENT_MODES);

    return {
      name: 'Scheme',
      aliases: ['scm'],
      illegal: /\S/,
      contains: [
        hljs.SHEBANG(),
        NUMBER,
        STRING,
        QUOTED_IDENT,
        QUOTED_LIST,
        LIST
      ].concat(COMMENT_MODES)
    };
  }

  return scheme;

})();

    hljs.registerLanguage('scheme', hljsGrammar);
  })();/*! `scss` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  const MODES = (hljs) => {
    return {
      IMPORTANT: {
        scope: 'meta',
        begin: '!important'
      },
      BLOCK_COMMENT: hljs.C_BLOCK_COMMENT_MODE,
      HEXCOLOR: {
        scope: 'number',
        begin: /#(([0-9a-fA-F]{3,4})|(([0-9a-fA-F]{2}){3,4}))\b/
      },
      FUNCTION_DISPATCH: {
        className: "built_in",
        begin: /[\w-]+(?=\()/
      },
      ATTRIBUTE_SELECTOR_MODE: {
        scope: 'selector-attr',
        begin: /\[/,
        end: /\]/,
        illegal: '$',
        contains: [
          hljs.APOS_STRING_MODE,
          hljs.QUOTE_STRING_MODE
        ]
      },
      CSS_NUMBER_MODE: {
        scope: 'number',
        begin: hljs.NUMBER_RE + '(' +
          '%|em|ex|ch|rem' +
          '|vw|vh|vmin|vmax' +
          '|cm|mm|in|pt|pc|px' +
          '|deg|grad|rad|turn' +
          '|s|ms' +
          '|Hz|kHz' +
          '|dpi|dpcm|dppx' +
          ')?',
        relevance: 0
      },
      CSS_VARIABLE: {
        className: "attr",
        begin: /--[A-Za-z_][A-Za-z0-9_-]*/
      }
    };
  };

  const HTML_TAGS = [
    'a',
    'abbr',
    'address',
    'article',
    'aside',
    'audio',
    'b',
    'blockquote',
    'body',
    'button',
    'canvas',
    'caption',
    'cite',
    'code',
    'dd',
    'del',
    'details',
    'dfn',
    'div',
    'dl',
    'dt',
    'em',
    'fieldset',
    'figcaption',
    'figure',
    'footer',
    'form',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'header',
    'hgroup',
    'html',
    'i',
    'iframe',
    'img',
    'input',
    'ins',
    'kbd',
    'label',
    'legend',
    'li',
    'main',
    'mark',
    'menu',
    'nav',
    'object',
    'ol',
    'optgroup',
    'option',
    'p',
    'picture',
    'q',
    'quote',
    'samp',
    'section',
    'select',
    'source',
    'span',
    'strong',
    'summary',
    'sup',
    'table',
    'tbody',
    'td',
    'textarea',
    'tfoot',
    'th',
    'thead',
    'time',
    'tr',
    'ul',
    'var',
    'video'
  ];

  const SVG_TAGS = [
    'defs',
    'g',
    'marker',
    'mask',
    'pattern',
    'svg',
    'switch',
    'symbol',
    'feBlend',
    'feColorMatrix',
    'feComponentTransfer',
    'feComposite',
    'feConvolveMatrix',
    'feDiffuseLighting',
    'feDisplacementMap',
    'feFlood',
    'feGaussianBlur',
    'feImage',
    'feMerge',
    'feMorphology',
    'feOffset',
    'feSpecularLighting',
    'feTile',
    'feTurbulence',
    'linearGradient',
    'radialGradient',
    'stop',
    'circle',
    'ellipse',
    'image',
    'line',
    'path',
    'polygon',
    'polyline',
    'rect',
    'text',
    'use',
    'textPath',
    'tspan',
    'foreignObject',
    'clipPath'
  ];

  const TAGS = [
    ...HTML_TAGS,
    ...SVG_TAGS,
  ];

  // Sorting, then reversing makes sure longer attributes/elements like
  // `font-weight` are matched fully instead of getting false positives on say `font`

  const MEDIA_FEATURES = [
    'any-hover',
    'any-pointer',
    'aspect-ratio',
    'color',
    'color-gamut',
    'color-index',
    'device-aspect-ratio',
    'device-height',
    'device-width',
    'display-mode',
    'forced-colors',
    'grid',
    'height',
    'hover',
    'inverted-colors',
    'monochrome',
    'orientation',
    'overflow-block',
    'overflow-inline',
    'pointer',
    'prefers-color-scheme',
    'prefers-contrast',
    'prefers-reduced-motion',
    'prefers-reduced-transparency',
    'resolution',
    'scan',
    'scripting',
    'update',
    'width',
    // TODO: find a better solution?
    'min-width',
    'max-width',
    'min-height',
    'max-height'
  ].sort().reverse();

  // https://developer.mozilla.org/en-US/docs/Web/CSS/Pseudo-classes
  const PSEUDO_CLASSES = [
    'active',
    'any-link',
    'blank',
    'checked',
    'current',
    'default',
    'defined',
    'dir', // dir()
    'disabled',
    'drop',
    'empty',
    'enabled',
    'first',
    'first-child',
    'first-of-type',
    'fullscreen',
    'future',
    'focus',
    'focus-visible',
    'focus-within',
    'has', // has()
    'host', // host or host()
    'host-context', // host-context()
    'hover',
    'indeterminate',
    'in-range',
    'invalid',
    'is', // is()
    'lang', // lang()
    'last-child',
    'last-of-type',
    'left',
    'link',
    'local-link',
    'not', // not()
    'nth-child', // nth-child()
    'nth-col', // nth-col()
    'nth-last-child', // nth-last-child()
    'nth-last-col', // nth-last-col()
    'nth-last-of-type', //nth-last-of-type()
    'nth-of-type', //nth-of-type()
    'only-child',
    'only-of-type',
    'optional',
    'out-of-range',
    'past',
    'placeholder-shown',
    'read-only',
    'read-write',
    'required',
    'right',
    'root',
    'scope',
    'target',
    'target-within',
    'user-invalid',
    'valid',
    'visited',
    'where' // where()
  ].sort().reverse();

  // https://developer.mozilla.org/en-US/docs/Web/CSS/Pseudo-elements
  const PSEUDO_ELEMENTS = [
    'after',
    'backdrop',
    'before',
    'cue',
    'cue-region',
    'first-letter',
    'first-line',
    'grammar-error',
    'marker',
    'part',
    'placeholder',
    'selection',
    'slotted',
    'spelling-error'
  ].sort().reverse();

  const ATTRIBUTES = [
    'accent-color',
    'align-content',
    'align-items',
    'align-self',
    'alignment-baseline',
    'all',
    'anchor-name',
    'animation',
    'animation-composition',
    'animation-delay',
    'animation-direction',
    'animation-duration',
    'animation-fill-mode',
    'animation-iteration-count',
    'animation-name',
    'animation-play-state',
    'animation-range',
    'animation-range-end',
    'animation-range-start',
    'animation-timeline',
    'animation-timing-function',
    'appearance',
    'aspect-ratio',
    'backdrop-filter',
    'backface-visibility',
    'background',
    'background-attachment',
    'background-blend-mode',
    'background-clip',
    'background-color',
    'background-image',
    'background-origin',
    'background-position',
    'background-position-x',
    'background-position-y',
    'background-repeat',
    'background-size',
    'baseline-shift',
    'block-size',
    'border',
    'border-block',
    'border-block-color',
    'border-block-end',
    'border-block-end-color',
    'border-block-end-style',
    'border-block-end-width',
    'border-block-start',
    'border-block-start-color',
    'border-block-start-style',
    'border-block-start-width',
    'border-block-style',
    'border-block-width',
    'border-bottom',
    'border-bottom-color',
    'border-bottom-left-radius',
    'border-bottom-right-radius',
    'border-bottom-style',
    'border-bottom-width',
    'border-collapse',
    'border-color',
    'border-end-end-radius',
    'border-end-start-radius',
    'border-image',
    'border-image-outset',
    'border-image-repeat',
    'border-image-slice',
    'border-image-source',
    'border-image-width',
    'border-inline',
    'border-inline-color',
    'border-inline-end',
    'border-inline-end-color',
    'border-inline-end-style',
    'border-inline-end-width',
    'border-inline-start',
    'border-inline-start-color',
    'border-inline-start-style',
    'border-inline-start-width',
    'border-inline-style',
    'border-inline-width',
    'border-left',
    'border-left-color',
    'border-left-style',
    'border-left-width',
    'border-radius',
    'border-right',
    'border-right-color',
    'border-right-style',
    'border-right-width',
    'border-spacing',
    'border-start-end-radius',
    'border-start-start-radius',
    'border-style',
    'border-top',
    'border-top-color',
    'border-top-left-radius',
    'border-top-right-radius',
    'border-top-style',
    'border-top-width',
    'border-width',
    'bottom',
    'box-align',
    'box-decoration-break',
    'box-direction',
    'box-flex',
    'box-flex-group',
    'box-lines',
    'box-ordinal-group',
    'box-orient',
    'box-pack',
    'box-shadow',
    'box-sizing',
    'break-after',
    'break-before',
    'break-inside',
    'caption-side',
    'caret-color',
    'clear',
    'clip',
    'clip-path',
    'clip-rule',
    'color',
    'color-interpolation',
    'color-interpolation-filters',
    'color-profile',
    'color-rendering',
    'color-scheme',
    'column-count',
    'column-fill',
    'column-gap',
    'column-rule',
    'column-rule-color',
    'column-rule-style',
    'column-rule-width',
    'column-span',
    'column-width',
    'columns',
    'contain',
    'contain-intrinsic-block-size',
    'contain-intrinsic-height',
    'contain-intrinsic-inline-size',
    'contain-intrinsic-size',
    'contain-intrinsic-width',
    'container',
    'container-name',
    'container-type',
    'content',
    'content-visibility',
    'counter-increment',
    'counter-reset',
    'counter-set',
    'cue',
    'cue-after',
    'cue-before',
    'cursor',
    'cx',
    'cy',
    'direction',
    'display',
    'dominant-baseline',
    'empty-cells',
    'enable-background',
    'field-sizing',
    'fill',
    'fill-opacity',
    'fill-rule',
    'filter',
    'flex',
    'flex-basis',
    'flex-direction',
    'flex-flow',
    'flex-grow',
    'flex-shrink',
    'flex-wrap',
    'float',
    'flood-color',
    'flood-opacity',
    'flow',
    'font',
    'font-display',
    'font-family',
    'font-feature-settings',
    'font-kerning',
    'font-language-override',
    'font-optical-sizing',
    'font-palette',
    'font-size',
    'font-size-adjust',
    'font-smooth',
    'font-smoothing',
    'font-stretch',
    'font-style',
    'font-synthesis',
    'font-synthesis-position',
    'font-synthesis-small-caps',
    'font-synthesis-style',
    'font-synthesis-weight',
    'font-variant',
    'font-variant-alternates',
    'font-variant-caps',
    'font-variant-east-asian',
    'font-variant-emoji',
    'font-variant-ligatures',
    'font-variant-numeric',
    'font-variant-position',
    'font-variation-settings',
    'font-weight',
    'forced-color-adjust',
    'gap',
    'glyph-orientation-horizontal',
    'glyph-orientation-vertical',
    'grid',
    'grid-area',
    'grid-auto-columns',
    'grid-auto-flow',
    'grid-auto-rows',
    'grid-column',
    'grid-column-end',
    'grid-column-start',
    'grid-gap',
    'grid-row',
    'grid-row-end',
    'grid-row-start',
    'grid-template',
    'grid-template-areas',
    'grid-template-columns',
    'grid-template-rows',
    'hanging-punctuation',
    'height',
    'hyphenate-character',
    'hyphenate-limit-chars',
    'hyphens',
    'icon',
    'image-orientation',
    'image-rendering',
    'image-resolution',
    'ime-mode',
    'initial-letter',
    'initial-letter-align',
    'inline-size',
    'inset',
    'inset-area',
    'inset-block',
    'inset-block-end',
    'inset-block-start',
    'inset-inline',
    'inset-inline-end',
    'inset-inline-start',
    'isolation',
    'justify-content',
    'justify-items',
    'justify-self',
    'kerning',
    'left',
    'letter-spacing',
    'lighting-color',
    'line-break',
    'line-height',
    'line-height-step',
    'list-style',
    'list-style-image',
    'list-style-position',
    'list-style-type',
    'margin',
    'margin-block',
    'margin-block-end',
    'margin-block-start',
    'margin-bottom',
    'margin-inline',
    'margin-inline-end',
    'margin-inline-start',
    'margin-left',
    'margin-right',
    'margin-top',
    'margin-trim',
    'marker',
    'marker-end',
    'marker-mid',
    'marker-start',
    'marks',
    'mask',
    'mask-border',
    'mask-border-mode',
    'mask-border-outset',
    'mask-border-repeat',
    'mask-border-slice',
    'mask-border-source',
    'mask-border-width',
    'mask-clip',
    'mask-composite',
    'mask-image',
    'mask-mode',
    'mask-origin',
    'mask-position',
    'mask-repeat',
    'mask-size',
    'mask-type',
    'masonry-auto-flow',
    'math-depth',
    'math-shift',
    'math-style',
    'max-block-size',
    'max-height',
    'max-inline-size',
    'max-width',
    'min-block-size',
    'min-height',
    'min-inline-size',
    'min-width',
    'mix-blend-mode',
    'nav-down',
    'nav-index',
    'nav-left',
    'nav-right',
    'nav-up',
    'none',
    'normal',
    'object-fit',
    'object-position',
    'offset',
    'offset-anchor',
    'offset-distance',
    'offset-path',
    'offset-position',
    'offset-rotate',
    'opacity',
    'order',
    'orphans',
    'outline',
    'outline-color',
    'outline-offset',
    'outline-style',
    'outline-width',
    'overflow',
    'overflow-anchor',
    'overflow-block',
    'overflow-clip-margin',
    'overflow-inline',
    'overflow-wrap',
    'overflow-x',
    'overflow-y',
    'overlay',
    'overscroll-behavior',
    'overscroll-behavior-block',
    'overscroll-behavior-inline',
    'overscroll-behavior-x',
    'overscroll-behavior-y',
    'padding',
    'padding-block',
    'padding-block-end',
    'padding-block-start',
    'padding-bottom',
    'padding-inline',
    'padding-inline-end',
    'padding-inline-start',
    'padding-left',
    'padding-right',
    'padding-top',
    'page',
    'page-break-after',
    'page-break-before',
    'page-break-inside',
    'paint-order',
    'pause',
    'pause-after',
    'pause-before',
    'perspective',
    'perspective-origin',
    'place-content',
    'place-items',
    'place-self',
    'pointer-events',
    'position',
    'position-anchor',
    'position-visibility',
    'print-color-adjust',
    'quotes',
    'r',
    'resize',
    'rest',
    'rest-after',
    'rest-before',
    'right',
    'rotate',
    'row-gap',
    'ruby-align',
    'ruby-position',
    'scale',
    'scroll-behavior',
    'scroll-margin',
    'scroll-margin-block',
    'scroll-margin-block-end',
    'scroll-margin-block-start',
    'scroll-margin-bottom',
    'scroll-margin-inline',
    'scroll-margin-inline-end',
    'scroll-margin-inline-start',
    'scroll-margin-left',
    'scroll-margin-right',
    'scroll-margin-top',
    'scroll-padding',
    'scroll-padding-block',
    'scroll-padding-block-end',
    'scroll-padding-block-start',
    'scroll-padding-bottom',
    'scroll-padding-inline',
    'scroll-padding-inline-end',
    'scroll-padding-inline-start',
    'scroll-padding-left',
    'scroll-padding-right',
    'scroll-padding-top',
    'scroll-snap-align',
    'scroll-snap-stop',
    'scroll-snap-type',
    'scroll-timeline',
    'scroll-timeline-axis',
    'scroll-timeline-name',
    'scrollbar-color',
    'scrollbar-gutter',
    'scrollbar-width',
    'shape-image-threshold',
    'shape-margin',
    'shape-outside',
    'shape-rendering',
    'speak',
    'speak-as',
    'src', // @font-face
    'stop-color',
    'stop-opacity',
    'stroke',
    'stroke-dasharray',
    'stroke-dashoffset',
    'stroke-linecap',
    'stroke-linejoin',
    'stroke-miterlimit',
    'stroke-opacity',
    'stroke-width',
    'tab-size',
    'table-layout',
    'text-align',
    'text-align-all',
    'text-align-last',
    'text-anchor',
    'text-combine-upright',
    'text-decoration',
    'text-decoration-color',
    'text-decoration-line',
    'text-decoration-skip',
    'text-decoration-skip-ink',
    'text-decoration-style',
    'text-decoration-thickness',
    'text-emphasis',
    'text-emphasis-color',
    'text-emphasis-position',
    'text-emphasis-style',
    'text-indent',
    'text-justify',
    'text-orientation',
    'text-overflow',
    'text-rendering',
    'text-shadow',
    'text-size-adjust',
    'text-transform',
    'text-underline-offset',
    'text-underline-position',
    'text-wrap',
    'text-wrap-mode',
    'text-wrap-style',
    'timeline-scope',
    'top',
    'touch-action',
    'transform',
    'transform-box',
    'transform-origin',
    'transform-style',
    'transition',
    'transition-behavior',
    'transition-delay',
    'transition-duration',
    'transition-property',
    'transition-timing-function',
    'translate',
    'unicode-bidi',
    'user-modify',
    'user-select',
    'vector-effect',
    'vertical-align',
    'view-timeline',
    'view-timeline-axis',
    'view-timeline-inset',
    'view-timeline-name',
    'view-transition-name',
    'visibility',
    'voice-balance',
    'voice-duration',
    'voice-family',
    'voice-pitch',
    'voice-range',
    'voice-rate',
    'voice-stress',
    'voice-volume',
    'white-space',
    'white-space-collapse',
    'widows',
    'width',
    'will-change',
    'word-break',
    'word-spacing',
    'word-wrap',
    'writing-mode',
    'x',
    'y',
    'z-index',
    'zoom'
  ].sort().reverse();

  /*
  Language: SCSS
  Description: Scss is an extension of the syntax of CSS.
  Author: Kurt Emch <kurt@kurtemch.com>
  Website: https://sass-lang.com
  Category: common, css, web
  */


  /** @type LanguageFn */
  function scss(hljs) {
    const modes = MODES(hljs);
    const PSEUDO_ELEMENTS$1 = PSEUDO_ELEMENTS;
    const PSEUDO_CLASSES$1 = PSEUDO_CLASSES;

    const AT_IDENTIFIER = '@[a-z-]+'; // @font-face
    const AT_MODIFIERS = "and or not only";
    const IDENT_RE = '[a-zA-Z-][a-zA-Z0-9_-]*';
    const VARIABLE = {
      className: 'variable',
      begin: '(\\$' + IDENT_RE + ')\\b',
      relevance: 0
    };

    return {
      name: 'SCSS',
      case_insensitive: true,
      illegal: '[=/|\']',
      contains: [
        hljs.C_LINE_COMMENT_MODE,
        hljs.C_BLOCK_COMMENT_MODE,
        // to recognize keyframe 40% etc which are outside the scope of our
        // attribute value mode
        modes.CSS_NUMBER_MODE,
        {
          className: 'selector-id',
          begin: '#[A-Za-z0-9_-]+',
          relevance: 0
        },
        {
          className: 'selector-class',
          begin: '\\.[A-Za-z0-9_-]+',
          relevance: 0
        },
        modes.ATTRIBUTE_SELECTOR_MODE,
        {
          className: 'selector-tag',
          begin: '\\b(' + TAGS.join('|') + ')\\b',
          // was there, before, but why?
          relevance: 0
        },
        {
          className: 'selector-pseudo',
          begin: ':(' + PSEUDO_CLASSES$1.join('|') + ')'
        },
        {
          className: 'selector-pseudo',
          begin: ':(:)?(' + PSEUDO_ELEMENTS$1.join('|') + ')'
        },
        VARIABLE,
        { // pseudo-selector params
          begin: /\(/,
          end: /\)/,
          contains: [ modes.CSS_NUMBER_MODE ]
        },
        modes.CSS_VARIABLE,
        {
          className: 'attribute',
          begin: '\\b(' + ATTRIBUTES.join('|') + ')\\b'
        },
        { begin: '\\b(whitespace|wait|w-resize|visible|vertical-text|vertical-ideographic|uppercase|upper-roman|upper-alpha|underline|transparent|top|thin|thick|text|text-top|text-bottom|tb-rl|table-header-group|table-footer-group|sw-resize|super|strict|static|square|solid|small-caps|separate|se-resize|scroll|s-resize|rtl|row-resize|ridge|right|repeat|repeat-y|repeat-x|relative|progress|pointer|overline|outside|outset|oblique|nowrap|not-allowed|normal|none|nw-resize|no-repeat|no-drop|newspaper|ne-resize|n-resize|move|middle|medium|ltr|lr-tb|lowercase|lower-roman|lower-alpha|loose|list-item|line|line-through|line-edge|lighter|left|keep-all|justify|italic|inter-word|inter-ideograph|inside|inset|inline|inline-block|inherit|inactive|ideograph-space|ideograph-parenthesis|ideograph-numeric|ideograph-alpha|horizontal|hidden|help|hand|groove|fixed|ellipsis|e-resize|double|dotted|distribute|distribute-space|distribute-letter|distribute-all-lines|disc|disabled|default|decimal|dashed|crosshair|collapse|col-resize|circle|char|center|capitalize|break-word|break-all|bottom|both|bolder|bold|block|bidi-override|below|baseline|auto|always|all-scroll|absolute|table|table-cell)\\b' },
        {
          begin: /:/,
          end: /[;}{]/,
          relevance: 0,
          contains: [
            modes.BLOCK_COMMENT,
            VARIABLE,
            modes.HEXCOLOR,
            modes.CSS_NUMBER_MODE,
            hljs.QUOTE_STRING_MODE,
            hljs.APOS_STRING_MODE,
            modes.IMPORTANT,
            modes.FUNCTION_DISPATCH
          ]
        },
        // matching these here allows us to treat them more like regular CSS
        // rules so everything between the {} gets regular rule highlighting,
        // which is what we want for page and font-face
        {
          begin: '@(page|font-face)',
          keywords: {
            $pattern: AT_IDENTIFIER,
            keyword: '@page @font-face'
          }
        },
        {
          begin: '@',
          end: '[{;]',
          returnBegin: true,
          keywords: {
            $pattern: /[a-z-]+/,
            keyword: AT_MODIFIERS,
            attribute: MEDIA_FEATURES.join(" ")
          },
          contains: [
            {
              begin: AT_IDENTIFIER,
              className: "keyword"
            },
            {
              begin: /[a-z-]+(?=:)/,
              className: "attribute"
            },
            VARIABLE,
            hljs.QUOTE_STRING_MODE,
            hljs.APOS_STRING_MODE,
            modes.HEXCOLOR,
            modes.CSS_NUMBER_MODE
          ]
        },
        modes.FUNCTION_DISPATCH
      ]
    };
  }

  return scss;

})();

    hljs.registerLanguage('scss', hljsGrammar);
  })();/*! `shell` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Shell Session
  Requires: bash.js
  Author: TSUYUSATO Kitsune <make.just.on@gmail.com>
  Category: common
  Audit: 2020
  */

  /** @type LanguageFn */
  function shell(hljs) {
    return {
      name: 'Shell Session',
      aliases: [
        'console',
        'shellsession'
      ],
      contains: [
        {
          className: 'meta.prompt',
          // We cannot add \s (spaces) in the regular expression otherwise it will be too broad and produce unexpected result.
          // For instance, in the following example, it would match "echo /path/to/home >" as a prompt:
          // echo /path/to/home > t.exe
          begin: /^\s{0,3}[/~\w\d[\]()@-]*[>%$#][ ]?/,
          starts: {
            end: /[^\\](?=\s*$)/,
            subLanguage: 'bash'
          }
        }
      ]
    };
  }

  return shell;

})();

    hljs.registerLanguage('shell', hljsGrammar);
  })();/*! `smalltalk` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Smalltalk
  Description: Smalltalk is an object-oriented, dynamically typed reflective programming language.
  Author: Vladimir Gubarkov <xonixx@gmail.com>
  Website: https://en.wikipedia.org/wiki/Smalltalk
  Category: system
  */

  function smalltalk(hljs) {
    const VAR_IDENT_RE = '[a-z][a-zA-Z0-9_]*';
    const CHAR = {
      className: 'string',
      begin: '\\$.{1}'
    };
    const SYMBOL = {
      className: 'symbol',
      begin: '#' + hljs.UNDERSCORE_IDENT_RE
    };
    return {
      name: 'Smalltalk',
      aliases: [ 'st' ],
      keywords: [
        "self",
        "super",
        "nil",
        "true",
        "false",
        "thisContext"
      ],
      contains: [
        hljs.COMMENT('"', '"'),
        hljs.APOS_STRING_MODE,
        {
          className: 'type',
          begin: '\\b[A-Z][A-Za-z0-9_]*',
          relevance: 0
        },
        {
          begin: VAR_IDENT_RE + ':',
          relevance: 0
        },
        hljs.C_NUMBER_MODE,
        SYMBOL,
        CHAR,
        {
          // This looks more complicated than needed to avoid combinatorial
          // explosion under V8. It effectively means `| var1 var2 ... |` with
          // whitespace adjacent to `|` being optional.
          begin: '\\|[ ]*' + VAR_IDENT_RE + '([ ]+' + VAR_IDENT_RE + ')*[ ]*\\|',
          returnBegin: true,
          end: /\|/,
          illegal: /\S/,
          contains: [ { begin: '(\\|[ ]*)?' + VAR_IDENT_RE } ]
        },
        {
          begin: '#\\(',
          end: '\\)',
          contains: [
            hljs.APOS_STRING_MODE,
            CHAR,
            hljs.C_NUMBER_MODE,
            SYMBOL
          ]
        }
      ]
    };
  }

  return smalltalk;

})();

    hljs.registerLanguage('smalltalk', hljsGrammar);
  })();/*! `sql` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
   Language: SQL
   Website: https://en.wikipedia.org/wiki/SQL
   Category: common, database
   */

  /*

  Goals:

  SQL is intended to highlight basic/common SQL keywords and expressions

  - If pretty much every single SQL server includes supports, then it's a canidate.
  - It is NOT intended to include tons of vendor specific keywords (Oracle, MySQL,
    PostgreSQL) although the list of data types is purposely a bit more expansive.
  - For more specific SQL grammars please see:
    - PostgreSQL and PL/pgSQL - core
    - T-SQL - https://github.com/highlightjs/highlightjs-tsql
    - sql_more (core)

   */

  function sql(hljs) {
    const regex = hljs.regex;
    const COMMENT_MODE = hljs.COMMENT('--', '$');
    const STRING = {
      scope: 'string',
      variants: [
        {
          begin: /'/,
          end: /'/,
          contains: [ { match: /''/ } ]
        }
      ]
    };
    const QUOTED_IDENTIFIER = {
      begin: /"/,
      end: /"/,
      contains: [ { match: /""/ } ]
    };

    const LITERALS = [
      "true",
      "false",
      // Not sure it's correct to call NULL literal, and clauses like IS [NOT] NULL look strange that way.
      // "null",
      "unknown"
    ];

    const MULTI_WORD_TYPES = [
      "double precision",
      "large object",
      "with timezone",
      "without timezone"
    ];

    const TYPES = [
      'bigint',
      'binary',
      'blob',
      'boolean',
      'char',
      'character',
      'clob',
      'date',
      'dec',
      'decfloat',
      'decimal',
      'float',
      'int',
      'integer',
      'interval',
      'nchar',
      'nclob',
      'national',
      'numeric',
      'real',
      'row',
      'smallint',
      'time',
      'timestamp',
      'varchar',
      'varying', // modifier (character varying)
      'varbinary'
    ];

    const NON_RESERVED_WORDS = [
      "add",
      "asc",
      "collation",
      "desc",
      "final",
      "first",
      "last",
      "view"
    ];

    // https://jakewheat.github.io/sql-overview/sql-2016-foundation-grammar.html#reserved-word
    const RESERVED_WORDS = [
      "abs",
      "acos",
      "all",
      "allocate",
      "alter",
      "and",
      "any",
      "are",
      "array",
      "array_agg",
      "array_max_cardinality",
      "as",
      "asensitive",
      "asin",
      "asymmetric",
      "at",
      "atan",
      "atomic",
      "authorization",
      "avg",
      "begin",
      "begin_frame",
      "begin_partition",
      "between",
      "bigint",
      "binary",
      "blob",
      "boolean",
      "both",
      "by",
      "call",
      "called",
      "cardinality",
      "cascaded",
      "case",
      "cast",
      "ceil",
      "ceiling",
      "char",
      "char_length",
      "character",
      "character_length",
      "check",
      "classifier",
      "clob",
      "close",
      "coalesce",
      "collate",
      "collect",
      "column",
      "commit",
      "condition",
      "connect",
      "constraint",
      "contains",
      "convert",
      "copy",
      "corr",
      "corresponding",
      "cos",
      "cosh",
      "count",
      "covar_pop",
      "covar_samp",
      "create",
      "cross",
      "cube",
      "cume_dist",
      "current",
      "current_catalog",
      "current_date",
      "current_default_transform_group",
      "current_path",
      "current_role",
      "current_row",
      "current_schema",
      "current_time",
      "current_timestamp",
      "current_path",
      "current_role",
      "current_transform_group_for_type",
      "current_user",
      "cursor",
      "cycle",
      "date",
      "day",
      "deallocate",
      "dec",
      "decimal",
      "decfloat",
      "declare",
      "default",
      "define",
      "delete",
      "dense_rank",
      "deref",
      "describe",
      "deterministic",
      "disconnect",
      "distinct",
      "double",
      "drop",
      "dynamic",
      "each",
      "element",
      "else",
      "empty",
      "end",
      "end_frame",
      "end_partition",
      "end-exec",
      "equals",
      "escape",
      "every",
      "except",
      "exec",
      "execute",
      "exists",
      "exp",
      "external",
      "extract",
      "false",
      "fetch",
      "filter",
      "first_value",
      "float",
      "floor",
      "for",
      "foreign",
      "frame_row",
      "free",
      "from",
      "full",
      "function",
      "fusion",
      "get",
      "global",
      "grant",
      "group",
      "grouping",
      "groups",
      "having",
      "hold",
      "hour",
      "identity",
      "in",
      "indicator",
      "initial",
      "inner",
      "inout",
      "insensitive",
      "insert",
      "int",
      "integer",
      "intersect",
      "intersection",
      "interval",
      "into",
      "is",
      "join",
      "json_array",
      "json_arrayagg",
      "json_exists",
      "json_object",
      "json_objectagg",
      "json_query",
      "json_table",
      "json_table_primitive",
      "json_value",
      "lag",
      "language",
      "large",
      "last_value",
      "lateral",
      "lead",
      "leading",
      "left",
      "like",
      "like_regex",
      "listagg",
      "ln",
      "local",
      "localtime",
      "localtimestamp",
      "log",
      "log10",
      "lower",
      "match",
      "match_number",
      "match_recognize",
      "matches",
      "max",
      "member",
      "merge",
      "method",
      "min",
      "minute",
      "mod",
      "modifies",
      "module",
      "month",
      "multiset",
      "national",
      "natural",
      "nchar",
      "nclob",
      "new",
      "no",
      "none",
      "normalize",
      "not",
      "nth_value",
      "ntile",
      "null",
      "nullif",
      "numeric",
      "octet_length",
      "occurrences_regex",
      "of",
      "offset",
      "old",
      "omit",
      "on",
      "one",
      "only",
      "open",
      "or",
      "order",
      "out",
      "outer",
      "over",
      "overlaps",
      "overlay",
      "parameter",
      "partition",
      "pattern",
      "per",
      "percent",
      "percent_rank",
      "percentile_cont",
      "percentile_disc",
      "period",
      "portion",
      "position",
      "position_regex",
      "power",
      "precedes",
      "precision",
      "prepare",
      "primary",
      "procedure",
      "ptf",
      "range",
      "rank",
      "reads",
      "real",
      "recursive",
      "ref",
      "references",
      "referencing",
      "regr_avgx",
      "regr_avgy",
      "regr_count",
      "regr_intercept",
      "regr_r2",
      "regr_slope",
      "regr_sxx",
      "regr_sxy",
      "regr_syy",
      "release",
      "result",
      "return",
      "returns",
      "revoke",
      "right",
      "rollback",
      "rollup",
      "row",
      "row_number",
      "rows",
      "running",
      "savepoint",
      "scope",
      "scroll",
      "search",
      "second",
      "seek",
      "select",
      "sensitive",
      "session_user",
      "set",
      "show",
      "similar",
      "sin",
      "sinh",
      "skip",
      "smallint",
      "some",
      "specific",
      "specifictype",
      "sql",
      "sqlexception",
      "sqlstate",
      "sqlwarning",
      "sqrt",
      "start",
      "static",
      "stddev_pop",
      "stddev_samp",
      "submultiset",
      "subset",
      "substring",
      "substring_regex",
      "succeeds",
      "sum",
      "symmetric",
      "system",
      "system_time",
      "system_user",
      "table",
      "tablesample",
      "tan",
      "tanh",
      "then",
      "time",
      "timestamp",
      "timezone_hour",
      "timezone_minute",
      "to",
      "trailing",
      "translate",
      "translate_regex",
      "translation",
      "treat",
      "trigger",
      "trim",
      "trim_array",
      "true",
      "truncate",
      "uescape",
      "union",
      "unique",
      "unknown",
      "unnest",
      "update",
      "upper",
      "user",
      "using",
      "value",
      "values",
      "value_of",
      "var_pop",
      "var_samp",
      "varbinary",
      "varchar",
      "varying",
      "versioning",
      "when",
      "whenever",
      "where",
      "width_bucket",
      "window",
      "with",
      "within",
      "without",
      "year",
    ];

    // these are reserved words we have identified to be functions
    // and should only be highlighted in a dispatch-like context
    // ie, array_agg(...), etc.
    const RESERVED_FUNCTIONS = [
      "abs",
      "acos",
      "array_agg",
      "asin",
      "atan",
      "avg",
      "cast",
      "ceil",
      "ceiling",
      "coalesce",
      "corr",
      "cos",
      "cosh",
      "count",
      "covar_pop",
      "covar_samp",
      "cume_dist",
      "dense_rank",
      "deref",
      "element",
      "exp",
      "extract",
      "first_value",
      "floor",
      "json_array",
      "json_arrayagg",
      "json_exists",
      "json_object",
      "json_objectagg",
      "json_query",
      "json_table",
      "json_table_primitive",
      "json_value",
      "lag",
      "last_value",
      "lead",
      "listagg",
      "ln",
      "log",
      "log10",
      "lower",
      "max",
      "min",
      "mod",
      "nth_value",
      "ntile",
      "nullif",
      "percent_rank",
      "percentile_cont",
      "percentile_disc",
      "position",
      "position_regex",
      "power",
      "rank",
      "regr_avgx",
      "regr_avgy",
      "regr_count",
      "regr_intercept",
      "regr_r2",
      "regr_slope",
      "regr_sxx",
      "regr_sxy",
      "regr_syy",
      "row_number",
      "sin",
      "sinh",
      "sqrt",
      "stddev_pop",
      "stddev_samp",
      "substring",
      "substring_regex",
      "sum",
      "tan",
      "tanh",
      "translate",
      "translate_regex",
      "treat",
      "trim",
      "trim_array",
      "unnest",
      "upper",
      "value_of",
      "var_pop",
      "var_samp",
      "width_bucket",
    ];

    // these functions can
    const POSSIBLE_WITHOUT_PARENS = [
      "current_catalog",
      "current_date",
      "current_default_transform_group",
      "current_path",
      "current_role",
      "current_schema",
      "current_transform_group_for_type",
      "current_user",
      "session_user",
      "system_time",
      "system_user",
      "current_time",
      "localtime",
      "current_timestamp",
      "localtimestamp"
    ];

    // those exist to boost relevance making these very
    // "SQL like" keyword combos worth +1 extra relevance
    const COMBOS = [
      "create table",
      "insert into",
      "primary key",
      "foreign key",
      "not null",
      "alter table",
      "add constraint",
      "grouping sets",
      "on overflow",
      "character set",
      "respect nulls",
      "ignore nulls",
      "nulls first",
      "nulls last",
      "depth first",
      "breadth first"
    ];

    const FUNCTIONS = RESERVED_FUNCTIONS;

    const KEYWORDS = [
      ...RESERVED_WORDS,
      ...NON_RESERVED_WORDS
    ].filter((keyword) => {
      return !RESERVED_FUNCTIONS.includes(keyword);
    });

    const VARIABLE = {
      scope: "variable",
      match: /@[a-z0-9][a-z0-9_]*/,
    };

    const OPERATOR = {
      scope: "operator",
      match: /[-+*/=%^~]|&&?|\|\|?|!=?|<(?:=>?|<|>)?|>[>=]?/,
      relevance: 0,
    };

    const FUNCTION_CALL = {
      match: regex.concat(/\b/, regex.either(...FUNCTIONS), /\s*\(/),
      relevance: 0,
      keywords: { built_in: FUNCTIONS }
    };

    // turns a multi-word keyword combo into a regex that doesn't
    // care about extra whitespace etc.
    // input: "START QUERY"
    // output: /\bSTART\s+QUERY\b/
    function kws_to_regex(list) {
      return regex.concat(
        /\b/,
        regex.either(...list.map((kw) => {
          return kw.replace(/\s+/, "\\s+")
        })),
        /\b/
      )
    }

    const MULTI_WORD_KEYWORDS = {
      scope: "keyword",
      match: kws_to_regex(COMBOS),
      relevance: 0,
    };

    // keywords with less than 3 letters are reduced in relevancy
    function reduceRelevancy(list, {
      exceptions, when
    } = {}) {
      const qualifyFn = when;
      exceptions = exceptions || [];
      return list.map((item) => {
        if (item.match(/\|\d+$/) || exceptions.includes(item)) {
          return item;
        } else if (qualifyFn(item)) {
          return `${item}|0`;
        } else {
          return item;
        }
      });
    }

    return {
      name: 'SQL',
      case_insensitive: true,
      // does not include {} or HTML tags `</`
      illegal: /[{}]|<\//,
      keywords: {
        $pattern: /\b[\w\.]+/,
        keyword:
          reduceRelevancy(KEYWORDS, { when: (x) => x.length < 3 }),
        literal: LITERALS,
        type: TYPES,
        built_in: POSSIBLE_WITHOUT_PARENS
      },
      contains: [
        {
          scope: "type",
          match: kws_to_regex(MULTI_WORD_TYPES)
        },
        MULTI_WORD_KEYWORDS,
        FUNCTION_CALL,
        VARIABLE,
        STRING,
        QUOTED_IDENTIFIER,
        hljs.C_NUMBER_MODE,
        hljs.C_BLOCK_COMMENT_MODE,
        COMMENT_MODE,
        OPERATOR
      ]
    };
  }

  return sql;

})();

    hljs.registerLanguage('sql', hljsGrammar);
  })();/*! `swift` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /**
   * @param {string} value
   * @returns {RegExp}
   * */

  /**
   * @param {RegExp | string } re
   * @returns {string}
   */
  function source(re) {
    if (!re) return null;
    if (typeof re === "string") return re;

    return re.source;
  }

  /**
   * @param {RegExp | string } re
   * @returns {string}
   */
  function lookahead(re) {
    return concat('(?=', re, ')');
  }

  /**
   * @param {...(RegExp | string) } args
   * @returns {string}
   */
  function concat(...args) {
    const joined = args.map((x) => source(x)).join("");
    return joined;
  }

  /**
   * @param { Array<string | RegExp | Object> } args
   * @returns {object}
   */
  function stripOptionsFromArgs(args) {
    const opts = args[args.length - 1];

    if (typeof opts === 'object' && opts.constructor === Object) {
      args.splice(args.length - 1, 1);
      return opts;
    } else {
      return {};
    }
  }

  /** @typedef { {capture?: boolean} } RegexEitherOptions */

  /**
   * Any of the passed expresssions may match
   *
   * Creates a huge this | this | that | that match
   * @param {(RegExp | string)[] | [...(RegExp | string)[], RegexEitherOptions]} args
   * @returns {string}
   */
  function either(...args) {
    /** @type { object & {capture?: boolean} }  */
    const opts = stripOptionsFromArgs(args);
    const joined = '('
      + (opts.capture ? "" : "?:")
      + args.map((x) => source(x)).join("|") + ")";
    return joined;
  }

  const keywordWrapper = keyword => concat(
    /\b/,
    keyword,
    /\w$/.test(keyword) ? /\b/ : /\B/
  );

  // Keywords that require a leading dot.
  const dotKeywords = [
    'Protocol', // contextual
    'Type' // contextual
  ].map(keywordWrapper);

  // Keywords that may have a leading dot.
  const optionalDotKeywords = [
    'init',
    'self'
  ].map(keywordWrapper);

  // should register as keyword, not type
  const keywordTypes = [
    'Any',
    'Self'
  ];

  // Regular keywords and literals.
  const keywords = [
    // strings below will be fed into the regular `keywords` engine while regex
    // will result in additional modes being created to scan for those keywords to
    // avoid conflicts with other rules
    'actor',
    'any', // contextual
    'associatedtype',
    'async',
    'await',
    /as\?/, // operator
    /as!/, // operator
    'as', // operator
    'borrowing', // contextual
    'break',
    'case',
    'catch',
    'class',
    'consume', // contextual
    'consuming', // contextual
    'continue',
    'convenience', // contextual
    'copy', // contextual
    'default',
    'defer',
    'deinit',
    'didSet', // contextual
    'distributed',
    'do',
    'dynamic', // contextual
    'each',
    'else',
    'enum',
    'extension',
    'fallthrough',
    /fileprivate\(set\)/,
    'fileprivate',
    'final', // contextual
    'for',
    'func',
    'get', // contextual
    'guard',
    'if',
    'import',
    'indirect', // contextual
    'infix', // contextual
    /init\?/,
    /init!/,
    'inout',
    /internal\(set\)/,
    'internal',
    'in',
    'is', // operator
    'isolated', // contextual
    'nonisolated', // contextual
    'lazy', // contextual
    'let',
    'macro',
    'mutating', // contextual
    'nonmutating', // contextual
    /open\(set\)/, // contextual
    'open', // contextual
    'operator',
    'optional', // contextual
    'override', // contextual
    'package',
    'postfix', // contextual
    'precedencegroup',
    'prefix', // contextual
    /private\(set\)/,
    'private',
    'protocol',
    /public\(set\)/,
    'public',
    'repeat',
    'required', // contextual
    'rethrows',
    'return',
    'set', // contextual
    'some', // contextual
    'static',
    'struct',
    'subscript',
    'super',
    'switch',
    'throws',
    'throw',
    /try\?/, // operator
    /try!/, // operator
    'try', // operator
    'typealias',
    /unowned\(safe\)/, // contextual
    /unowned\(unsafe\)/, // contextual
    'unowned', // contextual
    'var',
    'weak', // contextual
    'where',
    'while',
    'willSet' // contextual
  ];

  // NOTE: Contextual keywords are reserved only in specific contexts.
  // Ideally, these should be matched using modes to avoid false positives.

  // Literals.
  const literals = [
    'false',
    'nil',
    'true'
  ];

  // Keywords used in precedence groups.
  const precedencegroupKeywords = [
    'assignment',
    'associativity',
    'higherThan',
    'left',
    'lowerThan',
    'none',
    'right'
  ];

  // Keywords that start with a number sign (#).
  // #(un)available is handled separately.
  const numberSignKeywords = [
    '#colorLiteral',
    '#column',
    '#dsohandle',
    '#else',
    '#elseif',
    '#endif',
    '#error',
    '#file',
    '#fileID',
    '#fileLiteral',
    '#filePath',
    '#function',
    '#if',
    '#imageLiteral',
    '#keyPath',
    '#line',
    '#selector',
    '#sourceLocation',
    '#warning'
  ];

  // Global functions in the Standard Library.
  const builtIns = [
    'abs',
    'all',
    'any',
    'assert',
    'assertionFailure',
    'debugPrint',
    'dump',
    'fatalError',
    'getVaList',
    'isKnownUniquelyReferenced',
    'max',
    'min',
    'numericCast',
    'pointwiseMax',
    'pointwiseMin',
    'precondition',
    'preconditionFailure',
    'print',
    'readLine',
    'repeatElement',
    'sequence',
    'stride',
    'swap',
    'swift_unboxFromSwiftValueWithType',
    'transcode',
    'type',
    'unsafeBitCast',
    'unsafeDowncast',
    'withExtendedLifetime',
    'withUnsafeMutablePointer',
    'withUnsafePointer',
    'withVaList',
    'withoutActuallyEscaping',
    'zip'
  ];

  // Valid first characters for operators.
  const operatorHead = either(
    /[/=\-+!*%<>&|^~?]/,
    /[\u00A1-\u00A7]/,
    /[\u00A9\u00AB]/,
    /[\u00AC\u00AE]/,
    /[\u00B0\u00B1]/,
    /[\u00B6\u00BB\u00BF\u00D7\u00F7]/,
    /[\u2016-\u2017]/,
    /[\u2020-\u2027]/,
    /[\u2030-\u203E]/,
    /[\u2041-\u2053]/,
    /[\u2055-\u205E]/,
    /[\u2190-\u23FF]/,
    /[\u2500-\u2775]/,
    /[\u2794-\u2BFF]/,
    /[\u2E00-\u2E7F]/,
    /[\u3001-\u3003]/,
    /[\u3008-\u3020]/,
    /[\u3030]/
  );

  // Valid characters for operators.
  const operatorCharacter = either(
    operatorHead,
    /[\u0300-\u036F]/,
    /[\u1DC0-\u1DFF]/,
    /[\u20D0-\u20FF]/,
    /[\uFE00-\uFE0F]/,
    /[\uFE20-\uFE2F]/
    // TODO: The following characters are also allowed, but the regex isn't supported yet.
    // /[\u{E0100}-\u{E01EF}]/u
  );

  // Valid operator.
  const operator = concat(operatorHead, operatorCharacter, '*');

  // Valid first characters for identifiers.
  const identifierHead = either(
    /[a-zA-Z_]/,
    /[\u00A8\u00AA\u00AD\u00AF\u00B2-\u00B5\u00B7-\u00BA]/,
    /[\u00BC-\u00BE\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]/,
    /[\u0100-\u02FF\u0370-\u167F\u1681-\u180D\u180F-\u1DBF]/,
    /[\u1E00-\u1FFF]/,
    /[\u200B-\u200D\u202A-\u202E\u203F-\u2040\u2054\u2060-\u206F]/,
    /[\u2070-\u20CF\u2100-\u218F\u2460-\u24FF\u2776-\u2793]/,
    /[\u2C00-\u2DFF\u2E80-\u2FFF]/,
    /[\u3004-\u3007\u3021-\u302F\u3031-\u303F\u3040-\uD7FF]/,
    /[\uF900-\uFD3D\uFD40-\uFDCF\uFDF0-\uFE1F\uFE30-\uFE44]/,
    /[\uFE47-\uFEFE\uFF00-\uFFFD]/ // Should be /[\uFE47-\uFFFD]/, but we have to exclude FEFF.
    // The following characters are also allowed, but the regexes aren't supported yet.
    // /[\u{10000}-\u{1FFFD}\u{20000-\u{2FFFD}\u{30000}-\u{3FFFD}\u{40000}-\u{4FFFD}]/u,
    // /[\u{50000}-\u{5FFFD}\u{60000-\u{6FFFD}\u{70000}-\u{7FFFD}\u{80000}-\u{8FFFD}]/u,
    // /[\u{90000}-\u{9FFFD}\u{A0000-\u{AFFFD}\u{B0000}-\u{BFFFD}\u{C0000}-\u{CFFFD}]/u,
    // /[\u{D0000}-\u{DFFFD}\u{E0000-\u{EFFFD}]/u
  );

  // Valid characters for identifiers.
  const identifierCharacter = either(
    identifierHead,
    /\d/,
    /[\u0300-\u036F\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]/
  );

  // Valid identifier.
  const identifier = concat(identifierHead, identifierCharacter, '*');

  // Valid type identifier.
  const typeIdentifier = concat(/[A-Z]/, identifierCharacter, '*');

  // Built-in attributes, which are highlighted as keywords.
  // @available is handled separately.
  // https://docs.swift.org/swift-book/documentation/the-swift-programming-language/attributes
  const keywordAttributes = [
    'attached',
    'autoclosure',
    concat(/convention\(/, either('swift', 'block', 'c'), /\)/),
    'discardableResult',
    'dynamicCallable',
    'dynamicMemberLookup',
    'escaping',
    'freestanding',
    'frozen',
    'GKInspectable',
    'IBAction',
    'IBDesignable',
    'IBInspectable',
    'IBOutlet',
    'IBSegueAction',
    'inlinable',
    'main',
    'nonobjc',
    'NSApplicationMain',
    'NSCopying',
    'NSManaged',
    concat(/objc\(/, identifier, /\)/),
    'objc',
    'objcMembers',
    'propertyWrapper',
    'requires_stored_property_inits',
    'resultBuilder',
    'Sendable',
    'testable',
    'UIApplicationMain',
    'unchecked',
    'unknown',
    'usableFromInline',
    'warn_unqualified_access'
  ];

  // Contextual keywords used in @available and #(un)available.
  const availabilityKeywords = [
    'iOS',
    'iOSApplicationExtension',
    'macOS',
    'macOSApplicationExtension',
    'macCatalyst',
    'macCatalystApplicationExtension',
    'watchOS',
    'watchOSApplicationExtension',
    'tvOS',
    'tvOSApplicationExtension',
    'swift'
  ];

  /*
  Language: Swift
  Description: Swift is a general-purpose programming language built using a modern approach to safety, performance, and software design patterns.
  Author: Steven Van Impe <steven.vanimpe@icloud.com>
  Contributors: Chris Eidhof <chris@eidhof.nl>, Nate Cook <natecook@gmail.com>, Alexander Lichter <manniL@gmx.net>, Richard Gibson <gibson042@github>
  Website: https://swift.org
  Category: common, system
  */


  /** @type LanguageFn */
  function swift(hljs) {
    const WHITESPACE = {
      match: /\s+/,
      relevance: 0
    };
    // https://docs.swift.org/swift-book/ReferenceManual/LexicalStructure.html#ID411
    const BLOCK_COMMENT = hljs.COMMENT(
      '/\\*',
      '\\*/',
      { contains: [ 'self' ] }
    );
    const COMMENTS = [
      hljs.C_LINE_COMMENT_MODE,
      BLOCK_COMMENT
    ];

    // https://docs.swift.org/swift-book/ReferenceManual/LexicalStructure.html#ID413
    // https://docs.swift.org/swift-book/ReferenceManual/zzSummaryOfTheGrammar.html
    const DOT_KEYWORD = {
      match: [
        /\./,
        either(...dotKeywords, ...optionalDotKeywords)
      ],
      className: { 2: "keyword" }
    };
    const KEYWORD_GUARD = {
      // Consume .keyword to prevent highlighting properties and methods as keywords.
      match: concat(/\./, either(...keywords)),
      relevance: 0
    };
    const PLAIN_KEYWORDS = keywords
      .filter(kw => typeof kw === 'string')
      .concat([ "_|0" ]); // seems common, so 0 relevance
    const REGEX_KEYWORDS = keywords
      .filter(kw => typeof kw !== 'string') // find regex
      .concat(keywordTypes)
      .map(keywordWrapper);
    const KEYWORD = { variants: [
      {
        className: 'keyword',
        match: either(...REGEX_KEYWORDS, ...optionalDotKeywords)
      }
    ] };
    // find all the regular keywords
    const KEYWORDS = {
      $pattern: either(
        /\b\w+/, // regular keywords
        /#\w+/ // number keywords
      ),
      keyword: PLAIN_KEYWORDS
        .concat(numberSignKeywords),
      literal: literals
    };
    const KEYWORD_MODES = [
      DOT_KEYWORD,
      KEYWORD_GUARD,
      KEYWORD
    ];

    // https://github.com/apple/swift/tree/main/stdlib/public/core
    const BUILT_IN_GUARD = {
      // Consume .built_in to prevent highlighting properties and methods.
      match: concat(/\./, either(...builtIns)),
      relevance: 0
    };
    const BUILT_IN = {
      className: 'built_in',
      match: concat(/\b/, either(...builtIns), /(?=\()/)
    };
    const BUILT_INS = [
      BUILT_IN_GUARD,
      BUILT_IN
    ];

    // https://docs.swift.org/swift-book/ReferenceManual/LexicalStructure.html#ID418
    const OPERATOR_GUARD = {
      // Prevent -> from being highlighting as an operator.
      match: /->/,
      relevance: 0
    };
    const OPERATOR = {
      className: 'operator',
      relevance: 0,
      variants: [
        { match: operator },
        {
          // dot-operator: only operators that start with a dot are allowed to use dots as
          // characters (..., ...<, .*, etc). So there rule here is: a dot followed by one or more
          // characters that may also include dots.
          match: `\\.(\\.|${operatorCharacter})+` }
      ]
    };
    const OPERATORS = [
      OPERATOR_GUARD,
      OPERATOR
    ];

    // https://docs.swift.org/swift-book/ReferenceManual/LexicalStructure.html#grammar_numeric-literal
    // TODO: Update for leading `-` after lookbehind is supported everywhere
    const decimalDigits = '([0-9]_*)+';
    const hexDigits = '([0-9a-fA-F]_*)+';
    const NUMBER = {
      className: 'number',
      relevance: 0,
      variants: [
        // decimal floating-point-literal (subsumes decimal-literal)
        { match: `\\b(${decimalDigits})(\\.(${decimalDigits}))?` + `([eE][+-]?(${decimalDigits}))?\\b` },
        // hexadecimal floating-point-literal (subsumes hexadecimal-literal)
        { match: `\\b0x(${hexDigits})(\\.(${hexDigits}))?` + `([pP][+-]?(${decimalDigits}))?\\b` },
        // octal-literal
        { match: /\b0o([0-7]_*)+\b/ },
        // binary-literal
        { match: /\b0b([01]_*)+\b/ }
      ]
    };

    // https://docs.swift.org/swift-book/ReferenceManual/LexicalStructure.html#grammar_string-literal
    const ESCAPED_CHARACTER = (rawDelimiter = "") => ({
      className: 'subst',
      variants: [
        { match: concat(/\\/, rawDelimiter, /[0\\tnr"']/) },
        { match: concat(/\\/, rawDelimiter, /u\{[0-9a-fA-F]{1,8}\}/) }
      ]
    });
    const ESCAPED_NEWLINE = (rawDelimiter = "") => ({
      className: 'subst',
      match: concat(/\\/, rawDelimiter, /[\t ]*(?:[\r\n]|\r\n)/)
    });
    const INTERPOLATION = (rawDelimiter = "") => ({
      className: 'subst',
      label: "interpol",
      begin: concat(/\\/, rawDelimiter, /\(/),
      end: /\)/
    });
    const MULTILINE_STRING = (rawDelimiter = "") => ({
      begin: concat(rawDelimiter, /"""/),
      end: concat(/"""/, rawDelimiter),
      contains: [
        ESCAPED_CHARACTER(rawDelimiter),
        ESCAPED_NEWLINE(rawDelimiter),
        INTERPOLATION(rawDelimiter)
      ]
    });
    const SINGLE_LINE_STRING = (rawDelimiter = "") => ({
      begin: concat(rawDelimiter, /"/),
      end: concat(/"/, rawDelimiter),
      contains: [
        ESCAPED_CHARACTER(rawDelimiter),
        INTERPOLATION(rawDelimiter)
      ]
    });
    const STRING = {
      className: 'string',
      variants: [
        MULTILINE_STRING(),
        MULTILINE_STRING("#"),
        MULTILINE_STRING("##"),
        MULTILINE_STRING("###"),
        SINGLE_LINE_STRING(),
        SINGLE_LINE_STRING("#"),
        SINGLE_LINE_STRING("##"),
        SINGLE_LINE_STRING("###")
      ]
    };

    const REGEXP_CONTENTS = [
      hljs.BACKSLASH_ESCAPE,
      {
        begin: /\[/,
        end: /\]/,
        relevance: 0,
        contains: [ hljs.BACKSLASH_ESCAPE ]
      }
    ];

    const BARE_REGEXP_LITERAL = {
      begin: /\/[^\s](?=[^/\n]*\/)/,
      end: /\//,
      contains: REGEXP_CONTENTS
    };

    const EXTENDED_REGEXP_LITERAL = (rawDelimiter) => {
      const begin = concat(rawDelimiter, /\//);
      const end = concat(/\//, rawDelimiter);
      return {
        begin,
        end,
        contains: [
          ...REGEXP_CONTENTS,
          {
            scope: "comment",
            begin: `#(?!.*${end})`,
            end: /$/,
          },
        ],
      };
    };

    // https://docs.swift.org/swift-book/documentation/the-swift-programming-language/lexicalstructure/#Regular-Expression-Literals
    const REGEXP = {
      scope: "regexp",
      variants: [
        EXTENDED_REGEXP_LITERAL('###'),
        EXTENDED_REGEXP_LITERAL('##'),
        EXTENDED_REGEXP_LITERAL('#'),
        BARE_REGEXP_LITERAL
      ]
    };

    // https://docs.swift.org/swift-book/ReferenceManual/LexicalStructure.html#ID412
    const QUOTED_IDENTIFIER = { match: concat(/`/, identifier, /`/) };
    const IMPLICIT_PARAMETER = {
      className: 'variable',
      match: /\$\d+/
    };
    const PROPERTY_WRAPPER_PROJECTION = {
      className: 'variable',
      match: `\\$${identifierCharacter}+`
    };
    const IDENTIFIERS = [
      QUOTED_IDENTIFIER,
      IMPLICIT_PARAMETER,
      PROPERTY_WRAPPER_PROJECTION
    ];

    // https://docs.swift.org/swift-book/ReferenceManual/Attributes.html
    const AVAILABLE_ATTRIBUTE = {
      match: /(@|#(un)?)available/,
      scope: 'keyword',
      starts: { contains: [
        {
          begin: /\(/,
          end: /\)/,
          keywords: availabilityKeywords,
          contains: [
            ...OPERATORS,
            NUMBER,
            STRING
          ]
        }
      ] }
    };

    const KEYWORD_ATTRIBUTE = {
      scope: 'keyword',
      match: concat(/@/, either(...keywordAttributes), lookahead(either(/\(/, /\s+/))),
    };

    const USER_DEFINED_ATTRIBUTE = {
      scope: 'meta',
      match: concat(/@/, identifier)
    };

    const ATTRIBUTES = [
      AVAILABLE_ATTRIBUTE,
      KEYWORD_ATTRIBUTE,
      USER_DEFINED_ATTRIBUTE
    ];

    // https://docs.swift.org/swift-book/ReferenceManual/Types.html
    const TYPE = {
      match: lookahead(/\b[A-Z]/),
      relevance: 0,
      contains: [
        { // Common Apple frameworks, for relevance boost
          className: 'type',
          match: concat(/(AV|CA|CF|CG|CI|CL|CM|CN|CT|MK|MP|MTK|MTL|NS|SCN|SK|UI|WK|XC)/, identifierCharacter, '+')
        },
        { // Type identifier
          className: 'type',
          match: typeIdentifier,
          relevance: 0
        },
        { // Optional type
          match: /[?!]+/,
          relevance: 0
        },
        { // Variadic parameter
          match: /\.\.\./,
          relevance: 0
        },
        { // Protocol composition
          match: concat(/\s+&\s+/, lookahead(typeIdentifier)),
          relevance: 0
        }
      ]
    };
    const GENERIC_ARGUMENTS = {
      begin: /</,
      end: />/,
      keywords: KEYWORDS,
      contains: [
        ...COMMENTS,
        ...KEYWORD_MODES,
        ...ATTRIBUTES,
        OPERATOR_GUARD,
        TYPE
      ]
    };
    TYPE.contains.push(GENERIC_ARGUMENTS);

    // https://docs.swift.org/swift-book/ReferenceManual/Expressions.html#ID552
    // Prevents element names from being highlighted as keywords.
    const TUPLE_ELEMENT_NAME = {
      match: concat(identifier, /\s*:/),
      keywords: "_|0",
      relevance: 0
    };
    // Matches tuples as well as the parameter list of a function type.
    const TUPLE = {
      begin: /\(/,
      end: /\)/,
      relevance: 0,
      keywords: KEYWORDS,
      contains: [
        'self',
        TUPLE_ELEMENT_NAME,
        ...COMMENTS,
        REGEXP,
        ...KEYWORD_MODES,
        ...BUILT_INS,
        ...OPERATORS,
        NUMBER,
        STRING,
        ...IDENTIFIERS,
        ...ATTRIBUTES,
        TYPE
      ]
    };

    const GENERIC_PARAMETERS = {
      begin: /</,
      end: />/,
      keywords: 'repeat each',
      contains: [
        ...COMMENTS,
        TYPE
      ]
    };
    const FUNCTION_PARAMETER_NAME = {
      begin: either(
        lookahead(concat(identifier, /\s*:/)),
        lookahead(concat(identifier, /\s+/, identifier, /\s*:/))
      ),
      end: /:/,
      relevance: 0,
      contains: [
        {
          className: 'keyword',
          match: /\b_\b/
        },
        {
          className: 'params',
          match: identifier
        }
      ]
    };
    const FUNCTION_PARAMETERS = {
      begin: /\(/,
      end: /\)/,
      keywords: KEYWORDS,
      contains: [
        FUNCTION_PARAMETER_NAME,
        ...COMMENTS,
        ...KEYWORD_MODES,
        ...OPERATORS,
        NUMBER,
        STRING,
        ...ATTRIBUTES,
        TYPE,
        TUPLE
      ],
      endsParent: true,
      illegal: /["']/
    };
    // https://docs.swift.org/swift-book/ReferenceManual/Declarations.html#ID362
    // https://docs.swift.org/swift-book/documentation/the-swift-programming-language/declarations/#Macro-Declaration
    const FUNCTION_OR_MACRO = {
      match: [
        /(func|macro)/,
        /\s+/,
        either(QUOTED_IDENTIFIER.match, identifier, operator)
      ],
      className: {
        1: "keyword",
        3: "title.function"
      },
      contains: [
        GENERIC_PARAMETERS,
        FUNCTION_PARAMETERS,
        WHITESPACE
      ],
      illegal: [
        /\[/,
        /%/
      ]
    };

    // https://docs.swift.org/swift-book/ReferenceManual/Declarations.html#ID375
    // https://docs.swift.org/swift-book/ReferenceManual/Declarations.html#ID379
    const INIT_SUBSCRIPT = {
      match: [
        /\b(?:subscript|init[?!]?)/,
        /\s*(?=[<(])/,
      ],
      className: { 1: "keyword" },
      contains: [
        GENERIC_PARAMETERS,
        FUNCTION_PARAMETERS,
        WHITESPACE
      ],
      illegal: /\[|%/
    };
    // https://docs.swift.org/swift-book/ReferenceManual/Declarations.html#ID380
    const OPERATOR_DECLARATION = {
      match: [
        /operator/,
        /\s+/,
        operator
      ],
      className: {
        1: "keyword",
        3: "title"
      }
    };

    // https://docs.swift.org/swift-book/ReferenceManual/Declarations.html#ID550
    const PRECEDENCEGROUP = {
      begin: [
        /precedencegroup/,
        /\s+/,
        typeIdentifier
      ],
      className: {
        1: "keyword",
        3: "title"
      },
      contains: [ TYPE ],
      keywords: [
        ...precedencegroupKeywords,
        ...literals
      ],
      end: /}/
    };

    const CLASS_FUNC_DECLARATION = {
      match: [
        /class\b/,          
        /\s+/,
        /func\b/,
        /\s+/,
        /\b[A-Za-z_][A-Za-z0-9_]*\b/ 
      ],
      scope: {
        1: "keyword",
        3: "keyword",
        5: "title.function"
      }
    };

    const CLASS_VAR_DECLARATION = {
      match: [
        /class\b/,
        /\s+/,          
        /var\b/, 
      ],
      scope: {
        1: "keyword",
        3: "keyword"
      }
    };

    const TYPE_DECLARATION = {
      begin: [
        /(struct|protocol|class|extension|enum|actor)/,
        /\s+/,
        identifier,
        /\s*/,
      ],
      beginScope: {
        1: "keyword",
        3: "title.class"
      },
      keywords: KEYWORDS,
      contains: [
        GENERIC_PARAMETERS,
        ...KEYWORD_MODES,
        {
          begin: /:/,
          end: /\{/,
          keywords: KEYWORDS,
          contains: [
            {
              scope: "title.class.inherited",
              match: typeIdentifier,
            },
            ...KEYWORD_MODES,
          ],
          relevance: 0,
        },
      ]
    };

    // Add supported submodes to string interpolation.
    for (const variant of STRING.variants) {
      const interpolation = variant.contains.find(mode => mode.label === "interpol");
      // TODO: Interpolation can contain any expression, so there's room for improvement here.
      interpolation.keywords = KEYWORDS;
      const submodes = [
        ...KEYWORD_MODES,
        ...BUILT_INS,
        ...OPERATORS,
        NUMBER,
        STRING,
        ...IDENTIFIERS
      ];
      interpolation.contains = [
        ...submodes,
        {
          begin: /\(/,
          end: /\)/,
          contains: [
            'self',
            ...submodes
          ]
        }
      ];
    }

    return {
      name: 'Swift',
      keywords: KEYWORDS,
      contains: [
        ...COMMENTS,
        FUNCTION_OR_MACRO,
        INIT_SUBSCRIPT,
        CLASS_FUNC_DECLARATION,
        CLASS_VAR_DECLARATION,
        TYPE_DECLARATION,
        OPERATOR_DECLARATION,
        PRECEDENCEGROUP,
        {
          beginKeywords: 'import',
          end: /$/,
          contains: [ ...COMMENTS ],
          relevance: 0
        },
        REGEXP,
        ...KEYWORD_MODES,
        ...BUILT_INS,
        ...OPERATORS,
        NUMBER,
        STRING,
        ...IDENTIFIERS,
        ...ATTRIBUTES,
        TYPE,
        TUPLE
      ]
    };
  }

  return swift;

})();

    hljs.registerLanguage('swift', hljsGrammar);
  })();/*! `typescript` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  const IDENT_RE = '[A-Za-z$_][0-9A-Za-z$_]*';
  const KEYWORDS = [
    "as", // for exports
    "in",
    "of",
    "if",
    "for",
    "while",
    "finally",
    "var",
    "new",
    "function",
    "do",
    "return",
    "void",
    "else",
    "break",
    "catch",
    "instanceof",
    "with",
    "throw",
    "case",
    "default",
    "try",
    "switch",
    "continue",
    "typeof",
    "delete",
    "let",
    "yield",
    "const",
    "class",
    // JS handles these with a special rule
    // "get",
    // "set",
    "debugger",
    "async",
    "await",
    "static",
    "import",
    "from",
    "export",
    "extends",
    // It's reached stage 3, which is "recommended for implementation":
    "using"
  ];
  const LITERALS = [
    "true",
    "false",
    "null",
    "undefined",
    "NaN",
    "Infinity"
  ];

  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects
  const TYPES = [
    // Fundamental objects
    "Object",
    "Function",
    "Boolean",
    "Symbol",
    // numbers and dates
    "Math",
    "Date",
    "Number",
    "BigInt",
    // text
    "String",
    "RegExp",
    // Indexed collections
    "Array",
    "Float32Array",
    "Float64Array",
    "Int8Array",
    "Uint8Array",
    "Uint8ClampedArray",
    "Int16Array",
    "Int32Array",
    "Uint16Array",
    "Uint32Array",
    "BigInt64Array",
    "BigUint64Array",
    // Keyed collections
    "Set",
    "Map",
    "WeakSet",
    "WeakMap",
    // Structured data
    "ArrayBuffer",
    "SharedArrayBuffer",
    "Atomics",
    "DataView",
    "JSON",
    // Control abstraction objects
    "Promise",
    "Generator",
    "GeneratorFunction",
    "AsyncFunction",
    // Reflection
    "Reflect",
    "Proxy",
    // Internationalization
    "Intl",
    // WebAssembly
    "WebAssembly"
  ];

  const ERROR_TYPES = [
    "Error",
    "EvalError",
    "InternalError",
    "RangeError",
    "ReferenceError",
    "SyntaxError",
    "TypeError",
    "URIError"
  ];

  const BUILT_IN_GLOBALS = [
    "setInterval",
    "setTimeout",
    "clearInterval",
    "clearTimeout",

    "require",
    "exports",

    "eval",
    "isFinite",
    "isNaN",
    "parseFloat",
    "parseInt",
    "decodeURI",
    "decodeURIComponent",
    "encodeURI",
    "encodeURIComponent",
    "escape",
    "unescape"
  ];

  const BUILT_IN_VARIABLES = [
    "arguments",
    "this",
    "super",
    "console",
    "window",
    "document",
    "localStorage",
    "sessionStorage",
    "module",
    "global" // Node.js
  ];

  const BUILT_INS = [].concat(
    BUILT_IN_GLOBALS,
    TYPES,
    ERROR_TYPES
  );

  /*
  Language: JavaScript
  Description: JavaScript (JS) is a lightweight, interpreted, or just-in-time compiled programming language with first-class functions.
  Category: common, scripting, web
  Website: https://developer.mozilla.org/en-US/docs/Web/JavaScript
  */


  /** @type LanguageFn */
  function javascript(hljs) {
    const regex = hljs.regex;
    /**
     * Takes a string like "<Booger" and checks to see
     * if we can find a matching "</Booger" later in the
     * content.
     * @param {RegExpMatchArray} match
     * @param {{after:number}} param1
     */
    const hasClosingTag = (match, { after }) => {
      const tag = "</" + match[0].slice(1);
      const pos = match.input.indexOf(tag, after);
      return pos !== -1;
    };

    const IDENT_RE$1 = IDENT_RE;
    const FRAGMENT = {
      begin: '<>',
      end: '</>'
    };
    // to avoid some special cases inside isTrulyOpeningTag
    const XML_SELF_CLOSING = /<[A-Za-z0-9\\._:-]+\s*\/>/;
    const XML_TAG = {
      begin: /<[A-Za-z0-9\\._:-]+/,
      end: /\/[A-Za-z0-9\\._:-]+>|\/>/,
      /**
       * @param {RegExpMatchArray} match
       * @param {CallbackResponse} response
       */
      isTrulyOpeningTag: (match, response) => {
        const afterMatchIndex = match[0].length + match.index;
        const nextChar = match.input[afterMatchIndex];
        if (
          // HTML should not include another raw `<` inside a tag
          // nested type?
          // `<Array<Array<number>>`, etc.
          nextChar === "<" ||
          // the , gives away that this is not HTML
          // `<T, A extends keyof T, V>`
          nextChar === ","
          ) {
          response.ignoreMatch();
          return;
        }

        // `<something>`
        // Quite possibly a tag, lets look for a matching closing tag...
        if (nextChar === ">") {
          // if we cannot find a matching closing tag, then we
          // will ignore it
          if (!hasClosingTag(match, { after: afterMatchIndex })) {
            response.ignoreMatch();
          }
        }

        // `<blah />` (self-closing)
        // handled by simpleSelfClosing rule

        let m;
        const afterMatch = match.input.substring(afterMatchIndex);

        // some more template typing stuff
        //  <T = any>(key?: string) => Modify<
        if ((m = afterMatch.match(/^\s*=/))) {
          response.ignoreMatch();
          return;
        }

        // `<From extends string>`
        // technically this could be HTML, but it smells like a type
        // NOTE: This is ugh, but added specifically for https://github.com/highlightjs/highlight.js/issues/3276
        if ((m = afterMatch.match(/^\s+extends\s+/))) {
          if (m.index === 0) {
            response.ignoreMatch();
            // eslint-disable-next-line no-useless-return
            return;
          }
        }
      }
    };
    const KEYWORDS$1 = {
      $pattern: IDENT_RE,
      keyword: KEYWORDS,
      literal: LITERALS,
      built_in: BUILT_INS,
      "variable.language": BUILT_IN_VARIABLES
    };

    // https://tc39.es/ecma262/#sec-literals-numeric-literals
    const decimalDigits = '[0-9](_?[0-9])*';
    const frac = `\\.(${decimalDigits})`;
    // DecimalIntegerLiteral, including Annex B NonOctalDecimalIntegerLiteral
    // https://tc39.es/ecma262/#sec-additional-syntax-numeric-literals
    const decimalInteger = `0|[1-9](_?[0-9])*|0[0-7]*[89][0-9]*`;
    const NUMBER = {
      className: 'number',
      variants: [
        // DecimalLiteral
        { begin: `(\\b(${decimalInteger})((${frac})|\\.)?|(${frac}))` +
          `[eE][+-]?(${decimalDigits})\\b` },
        { begin: `\\b(${decimalInteger})\\b((${frac})\\b|\\.)?|(${frac})\\b` },

        // DecimalBigIntegerLiteral
        { begin: `\\b(0|[1-9](_?[0-9])*)n\\b` },

        // NonDecimalIntegerLiteral
        { begin: "\\b0[xX][0-9a-fA-F](_?[0-9a-fA-F])*n?\\b" },
        { begin: "\\b0[bB][0-1](_?[0-1])*n?\\b" },
        { begin: "\\b0[oO][0-7](_?[0-7])*n?\\b" },

        // LegacyOctalIntegerLiteral (does not include underscore separators)
        // https://tc39.es/ecma262/#sec-additional-syntax-numeric-literals
        { begin: "\\b0[0-7]+n?\\b" },
      ],
      relevance: 0
    };

    const SUBST = {
      className: 'subst',
      begin: '\\$\\{',
      end: '\\}',
      keywords: KEYWORDS$1,
      contains: [] // defined later
    };
    const HTML_TEMPLATE = {
      begin: '\.?html`',
      end: '',
      starts: {
        end: '`',
        returnEnd: false,
        contains: [
          hljs.BACKSLASH_ESCAPE,
          SUBST
        ],
        subLanguage: 'xml'
      }
    };
    const CSS_TEMPLATE = {
      begin: '\.?css`',
      end: '',
      starts: {
        end: '`',
        returnEnd: false,
        contains: [
          hljs.BACKSLASH_ESCAPE,
          SUBST
        ],
        subLanguage: 'css'
      }
    };
    const GRAPHQL_TEMPLATE = {
      begin: '\.?gql`',
      end: '',
      starts: {
        end: '`',
        returnEnd: false,
        contains: [
          hljs.BACKSLASH_ESCAPE,
          SUBST
        ],
        subLanguage: 'graphql'
      }
    };
    const TEMPLATE_STRING = {
      className: 'string',
      begin: '`',
      end: '`',
      contains: [
        hljs.BACKSLASH_ESCAPE,
        SUBST
      ]
    };
    const JSDOC_COMMENT = hljs.COMMENT(
      /\/\*\*(?!\/)/,
      '\\*/',
      {
        relevance: 0,
        contains: [
          {
            begin: '(?=@[A-Za-z]+)',
            relevance: 0,
            contains: [
              {
                className: 'doctag',
                begin: '@[A-Za-z]+'
              },
              {
                className: 'type',
                begin: '\\{',
                end: '\\}',
                excludeEnd: true,
                excludeBegin: true,
                relevance: 0
              },
              {
                className: 'variable',
                begin: IDENT_RE$1 + '(?=\\s*(-)|$)',
                endsParent: true,
                relevance: 0
              },
              // eat spaces (not newlines) so we can find
              // types or variables
              {
                begin: /(?=[^\n])\s/,
                relevance: 0
              }
            ]
          }
        ]
      }
    );
    const COMMENT = {
      className: "comment",
      variants: [
        JSDOC_COMMENT,
        hljs.C_BLOCK_COMMENT_MODE,
        hljs.C_LINE_COMMENT_MODE
      ]
    };
    const SUBST_INTERNALS = [
      hljs.APOS_STRING_MODE,
      hljs.QUOTE_STRING_MODE,
      HTML_TEMPLATE,
      CSS_TEMPLATE,
      GRAPHQL_TEMPLATE,
      TEMPLATE_STRING,
      // Skip numbers when they are part of a variable name
      { match: /\$\d+/ },
      NUMBER,
      // This is intentional:
      // See https://github.com/highlightjs/highlight.js/issues/3288
      // hljs.REGEXP_MODE
    ];
    SUBST.contains = SUBST_INTERNALS
      .concat({
        // we need to pair up {} inside our subst to prevent
        // it from ending too early by matching another }
        begin: /\{/,
        end: /\}/,
        keywords: KEYWORDS$1,
        contains: [
          "self"
        ].concat(SUBST_INTERNALS)
      });
    const SUBST_AND_COMMENTS = [].concat(COMMENT, SUBST.contains);
    const PARAMS_CONTAINS = SUBST_AND_COMMENTS.concat([
      // eat recursive parens in sub expressions
      {
        begin: /(\s*)\(/,
        end: /\)/,
        keywords: KEYWORDS$1,
        contains: ["self"].concat(SUBST_AND_COMMENTS)
      }
    ]);
    const PARAMS = {
      className: 'params',
      // convert this to negative lookbehind in v12
      begin: /(\s*)\(/, // to match the parms with
      end: /\)/,
      excludeBegin: true,
      excludeEnd: true,
      keywords: KEYWORDS$1,
      contains: PARAMS_CONTAINS
    };

    // ES6 classes
    const CLASS_OR_EXTENDS = {
      variants: [
        // class Car extends vehicle
        {
          match: [
            /class/,
            /\s+/,
            IDENT_RE$1,
            /\s+/,
            /extends/,
            /\s+/,
            regex.concat(IDENT_RE$1, "(", regex.concat(/\./, IDENT_RE$1), ")*")
          ],
          scope: {
            1: "keyword",
            3: "title.class",
            5: "keyword",
            7: "title.class.inherited"
          }
        },
        // class Car
        {
          match: [
            /class/,
            /\s+/,
            IDENT_RE$1
          ],
          scope: {
            1: "keyword",
            3: "title.class"
          }
        },

      ]
    };

    const CLASS_REFERENCE = {
      relevance: 0,
      match:
      regex.either(
        // Hard coded exceptions
        /\bJSON/,
        // Float32Array, OutT
        /\b[A-Z][a-z]+([A-Z][a-z]*|\d)*/,
        // CSSFactory, CSSFactoryT
        /\b[A-Z]{2,}([A-Z][a-z]+|\d)+([A-Z][a-z]*)*/,
        // FPs, FPsT
        /\b[A-Z]{2,}[a-z]+([A-Z][a-z]+|\d)*([A-Z][a-z]*)*/,
        // P
        // single letters are not highlighted
        // BLAH
        // this will be flagged as a UPPER_CASE_CONSTANT instead
      ),
      className: "title.class",
      keywords: {
        _: [
          // se we still get relevance credit for JS library classes
          ...TYPES,
          ...ERROR_TYPES
        ]
      }
    };

    const USE_STRICT = {
      label: "use_strict",
      className: 'meta',
      relevance: 10,
      begin: /^\s*['"]use (strict|asm)['"]/
    };

    const FUNCTION_DEFINITION = {
      variants: [
        {
          match: [
            /function/,
            /\s+/,
            IDENT_RE$1,
            /(?=\s*\()/
          ]
        },
        // anonymous function
        {
          match: [
            /function/,
            /\s*(?=\()/
          ]
        }
      ],
      className: {
        1: "keyword",
        3: "title.function"
      },
      label: "func.def",
      contains: [ PARAMS ],
      illegal: /%/
    };

    const UPPER_CASE_CONSTANT = {
      relevance: 0,
      match: /\b[A-Z][A-Z_0-9]+\b/,
      className: "variable.constant"
    };

    function noneOf(list) {
      return regex.concat("(?!", list.join("|"), ")");
    }

    const FUNCTION_CALL = {
      match: regex.concat(
        /\b/,
        noneOf([
          ...BUILT_IN_GLOBALS,
          "super",
          "import"
        ].map(x => `${x}\\s*\\(`)),
        IDENT_RE$1, regex.lookahead(/\s*\(/)),
      className: "title.function",
      relevance: 0
    };

    const PROPERTY_ACCESS = {
      begin: regex.concat(/\./, regex.lookahead(
        regex.concat(IDENT_RE$1, /(?![0-9A-Za-z$_(])/)
      )),
      end: IDENT_RE$1,
      excludeBegin: true,
      keywords: "prototype",
      className: "property",
      relevance: 0
    };

    const GETTER_OR_SETTER = {
      match: [
        /get|set/,
        /\s+/,
        IDENT_RE$1,
        /(?=\()/
      ],
      className: {
        1: "keyword",
        3: "title.function"
      },
      contains: [
        { // eat to avoid empty params
          begin: /\(\)/
        },
        PARAMS
      ]
    };

    const FUNC_LEAD_IN_RE = '(\\(' +
      '[^()]*(\\(' +
      '[^()]*(\\(' +
      '[^()]*' +
      '\\)[^()]*)*' +
      '\\)[^()]*)*' +
      '\\)|' + hljs.UNDERSCORE_IDENT_RE + ')\\s*=>';

    const FUNCTION_VARIABLE = {
      match: [
        /const|var|let/, /\s+/,
        IDENT_RE$1, /\s*/,
        /=\s*/,
        /(async\s*)?/, // async is optional
        regex.lookahead(FUNC_LEAD_IN_RE)
      ],
      keywords: "async",
      className: {
        1: "keyword",
        3: "title.function"
      },
      contains: [
        PARAMS
      ]
    };

    return {
      name: 'JavaScript',
      aliases: ['js', 'jsx', 'mjs', 'cjs'],
      keywords: KEYWORDS$1,
      // this will be extended by TypeScript
      exports: { PARAMS_CONTAINS, CLASS_REFERENCE },
      illegal: /#(?![$_A-z])/,
      contains: [
        hljs.SHEBANG({
          label: "shebang",
          binary: "node",
          relevance: 5
        }),
        USE_STRICT,
        hljs.APOS_STRING_MODE,
        hljs.QUOTE_STRING_MODE,
        HTML_TEMPLATE,
        CSS_TEMPLATE,
        GRAPHQL_TEMPLATE,
        TEMPLATE_STRING,
        COMMENT,
        // Skip numbers when they are part of a variable name
        { match: /\$\d+/ },
        NUMBER,
        CLASS_REFERENCE,
        {
          scope: 'attr',
          match: IDENT_RE$1 + regex.lookahead(':'),
          relevance: 0
        },
        FUNCTION_VARIABLE,
        { // "value" container
          begin: '(' + hljs.RE_STARTERS_RE + '|\\b(case|return|throw)\\b)\\s*',
          keywords: 'return throw case',
          relevance: 0,
          contains: [
            COMMENT,
            hljs.REGEXP_MODE,
            {
              className: 'function',
              // we have to count the parens to make sure we actually have the
              // correct bounding ( ) before the =>.  There could be any number of
              // sub-expressions inside also surrounded by parens.
              begin: FUNC_LEAD_IN_RE,
              returnBegin: true,
              end: '\\s*=>',
              contains: [
                {
                  className: 'params',
                  variants: [
                    {
                      begin: hljs.UNDERSCORE_IDENT_RE,
                      relevance: 0
                    },
                    {
                      className: null,
                      begin: /\(\s*\)/,
                      skip: true
                    },
                    {
                      begin: /(\s*)\(/,
                      end: /\)/,
                      excludeBegin: true,
                      excludeEnd: true,
                      keywords: KEYWORDS$1,
                      contains: PARAMS_CONTAINS
                    }
                  ]
                }
              ]
            },
            { // could be a comma delimited list of params to a function call
              begin: /,/,
              relevance: 0
            },
            {
              match: /\s+/,
              relevance: 0
            },
            { // JSX
              variants: [
                { begin: FRAGMENT.begin, end: FRAGMENT.end },
                { match: XML_SELF_CLOSING },
                {
                  begin: XML_TAG.begin,
                  // we carefully check the opening tag to see if it truly
                  // is a tag and not a false positive
                  'on:begin': XML_TAG.isTrulyOpeningTag,
                  end: XML_TAG.end
                }
              ],
              subLanguage: 'xml',
              contains: [
                {
                  begin: XML_TAG.begin,
                  end: XML_TAG.end,
                  skip: true,
                  contains: ['self']
                }
              ]
            }
          ],
        },
        FUNCTION_DEFINITION,
        {
          // prevent this from getting swallowed up by function
          // since they appear "function like"
          beginKeywords: "while if switch catch for"
        },
        {
          // we have to count the parens to make sure we actually have the correct
          // bounding ( ).  There could be any number of sub-expressions inside
          // also surrounded by parens.
          begin: '\\b(?!function)' + hljs.UNDERSCORE_IDENT_RE +
            '\\(' + // first parens
            '[^()]*(\\(' +
              '[^()]*(\\(' +
                '[^()]*' +
              '\\)[^()]*)*' +
            '\\)[^()]*)*' +
            '\\)\\s*\\{', // end parens
          returnBegin:true,
          label: "func.def",
          contains: [
            PARAMS,
            hljs.inherit(hljs.TITLE_MODE, { begin: IDENT_RE$1, className: "title.function" })
          ]
        },
        // catch ... so it won't trigger the property rule below
        {
          match: /\.\.\./,
          relevance: 0
        },
        PROPERTY_ACCESS,
        // hack: prevents detection of keywords in some circumstances
        // .keyword()
        // $keyword = x
        {
          match: '\\$' + IDENT_RE$1,
          relevance: 0
        },
        {
          match: [ /\bconstructor(?=\s*\()/ ],
          className: { 1: "title.function" },
          contains: [ PARAMS ]
        },
        FUNCTION_CALL,
        UPPER_CASE_CONSTANT,
        CLASS_OR_EXTENDS,
        GETTER_OR_SETTER,
        {
          match: /\$[(.]/ // relevance booster for a pattern common to JS libs: `$(something)` and `$.something`
        }
      ]
    };
  }

  /*
  Language: TypeScript
  Author: Panu Horsmalahti <panu.horsmalahti@iki.fi>
  Contributors: Ike Ku <dempfi@yahoo.com>
  Description: TypeScript is a strict superset of JavaScript
  Website: https://www.typescriptlang.org
  Category: common, scripting
  */


  /** @type LanguageFn */
  function typescript(hljs) {
    const regex = hljs.regex;
    const tsLanguage = javascript(hljs);

    const IDENT_RE$1 = IDENT_RE;
    const TYPES = [
      "any",
      "void",
      "number",
      "boolean",
      "string",
      "object",
      "never",
      "symbol",
      "bigint",
      "unknown"
    ];
    const NAMESPACE = {
      begin: [
        /namespace/,
        /\s+/,
        hljs.IDENT_RE
      ],
      beginScope: {
        1: "keyword",
        3: "title.class"
      }
    };
    const INTERFACE = {
      beginKeywords: 'interface',
      end: /\{/,
      excludeEnd: true,
      keywords: {
        keyword: 'interface extends',
        built_in: TYPES
      },
      contains: [ tsLanguage.exports.CLASS_REFERENCE ]
    };
    const USE_STRICT = {
      className: 'meta',
      relevance: 10,
      begin: /^\s*['"]use strict['"]/
    };
    const TS_SPECIFIC_KEYWORDS = [
      "type",
      // "namespace",
      "interface",
      "public",
      "private",
      "protected",
      "implements",
      "declare",
      "abstract",
      "readonly",
      "enum",
      "override",
      "satisfies"
    ];
    /*
      namespace is a TS keyword but it's fine to use it as a variable name too.
      const message = 'foo';
      const namespace = 'bar';
    */
    const KEYWORDS$1 = {
      $pattern: IDENT_RE,
      keyword: KEYWORDS.concat(TS_SPECIFIC_KEYWORDS),
      literal: LITERALS,
      built_in: BUILT_INS.concat(TYPES),
      "variable.language": BUILT_IN_VARIABLES
    };

    const DECORATOR = {
      className: 'meta',
      begin: '@' + IDENT_RE$1,
    };

    const swapMode = (mode, label, replacement) => {
      const indx = mode.contains.findIndex(m => m.label === label);
      if (indx === -1) { throw new Error("can not find mode to replace"); }

      mode.contains.splice(indx, 1, replacement);
    };


    // this should update anywhere keywords is used since
    // it will be the same actual JS object
    Object.assign(tsLanguage.keywords, KEYWORDS$1);

    tsLanguage.exports.PARAMS_CONTAINS.push(DECORATOR);

    // highlight the function params
    const ATTRIBUTE_HIGHLIGHT = tsLanguage.contains.find(c => c.scope === "attr");

    // take default attr rule and extend it to support optionals
    const OPTIONAL_KEY_OR_ARGUMENT = Object.assign({},
      ATTRIBUTE_HIGHLIGHT,
      { match: regex.concat(IDENT_RE$1, regex.lookahead(/\s*\?:/)) }
    );
    tsLanguage.exports.PARAMS_CONTAINS.push([
      tsLanguage.exports.CLASS_REFERENCE, // class reference for highlighting the params types
      ATTRIBUTE_HIGHLIGHT, // highlight the params key
      OPTIONAL_KEY_OR_ARGUMENT, // Added for optional property assignment highlighting
    ]);

    // Add the optional property assignment highlighting for objects or classes
    tsLanguage.contains = tsLanguage.contains.concat([
      DECORATOR,
      NAMESPACE,
      INTERFACE,
      OPTIONAL_KEY_OR_ARGUMENT, // Added for optional property assignment highlighting
    ]);

    // TS gets a simpler shebang rule than JS
    swapMode(tsLanguage, "shebang", hljs.SHEBANG());
    // JS use strict rule purposely excludes `asm` which makes no sense
    swapMode(tsLanguage, "use_strict", USE_STRICT);

    const functionDeclaration = tsLanguage.contains.find(m => m.label === "func.def");
    functionDeclaration.relevance = 0; // () => {} is more typical in TypeScript

    Object.assign(tsLanguage, {
      name: 'TypeScript',
      aliases: [
        'ts',
        'tsx',
        'mts',
        'cts'
      ]
    });

    return tsLanguage;
  }

  return typescript;

})();

    hljs.registerLanguage('typescript', hljsGrammar);
  })();/*! `vbnet` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Visual Basic .NET
  Description: Visual Basic .NET (VB.NET) is a multi-paradigm, object-oriented programming language, implemented on the .NET Framework.
  Authors: Poren Chiang <ren.chiang@gmail.com>, Jan Pilzer
  Website: https://docs.microsoft.com/dotnet/visual-basic/getting-started
  Category: common
  */

  /** @type LanguageFn */
  function vbnet(hljs) {
    const regex = hljs.regex;
    /**
     * Character Literal
     * Either a single character ("a"C) or an escaped double quote (""""C).
     */
    const CHARACTER = {
      className: 'string',
      begin: /"(""|[^/n])"C\b/
    };

    const STRING = {
      className: 'string',
      begin: /"/,
      end: /"/,
      illegal: /\n/,
      contains: [
        {
          // double quote escape
          begin: /""/ }
      ]
    };

    /** Date Literals consist of a date, a time, or both separated by whitespace, surrounded by # */
    const MM_DD_YYYY = /\d{1,2}\/\d{1,2}\/\d{4}/;
    const YYYY_MM_DD = /\d{4}-\d{1,2}-\d{1,2}/;
    const TIME_12H = /(\d|1[012])(:\d+){0,2} *(AM|PM)/;
    const TIME_24H = /\d{1,2}(:\d{1,2}){1,2}/;
    const DATE = {
      className: 'literal',
      variants: [
        {
          // #YYYY-MM-DD# (ISO-Date) or #M/D/YYYY# (US-Date)
          begin: regex.concat(/# */, regex.either(YYYY_MM_DD, MM_DD_YYYY), / *#/) },
        {
          // #H:mm[:ss]# (24h Time)
          begin: regex.concat(/# */, TIME_24H, / *#/) },
        {
          // #h[:mm[:ss]] A# (12h Time)
          begin: regex.concat(/# */, TIME_12H, / *#/) },
        {
          // date plus time
          begin: regex.concat(
            /# */,
            regex.either(YYYY_MM_DD, MM_DD_YYYY),
            / +/,
            regex.either(TIME_12H, TIME_24H),
            / *#/
          ) }
      ]
    };

    const NUMBER = {
      className: 'number',
      relevance: 0,
      variants: [
        {
          // Float
          begin: /\b\d[\d_]*((\.[\d_]+(E[+-]?[\d_]+)?)|(E[+-]?[\d_]+))[RFD@!#]?/ },
        {
          // Integer (base 10)
          begin: /\b\d[\d_]*((U?[SIL])|[%&])?/ },
        {
          // Integer (base 16)
          begin: /&H[\dA-F_]+((U?[SIL])|[%&])?/ },
        {
          // Integer (base 8)
          begin: /&O[0-7_]+((U?[SIL])|[%&])?/ },
        {
          // Integer (base 2)
          begin: /&B[01_]+((U?[SIL])|[%&])?/ }
      ]
    };

    const LABEL = {
      className: 'label',
      begin: /^\w+:/
    };

    const DOC_COMMENT = hljs.COMMENT(/'''/, /$/, { contains: [
      {
        className: 'doctag',
        begin: /<\/?/,
        end: />/
      }
    ] });

    const COMMENT = hljs.COMMENT(null, /$/, { variants: [
      { begin: /'/ },
      {
        // TODO: Use multi-class for leading spaces
        begin: /([\t ]|^)REM(?=\s)/ }
    ] });

    const DIRECTIVES = {
      className: 'meta',
      // TODO: Use multi-class for indentation once available
      begin: /[\t ]*#(const|disable|else|elseif|enable|end|externalsource|if|region)\b/,
      end: /$/,
      keywords: { keyword:
          'const disable else elseif enable end externalsource if region then' },
      contains: [ COMMENT ]
    };

    return {
      name: 'Visual Basic .NET',
      aliases: [ 'vb' ],
      case_insensitive: true,
      classNameAliases: { label: 'symbol' },
      keywords: {
        keyword:
          'addhandler alias aggregate ansi as async assembly auto binary by byref byval ' /* a-b */
          + 'call case catch class compare const continue custom declare default delegate dim distinct do ' /* c-d */
          + 'each equals else elseif end enum erase error event exit explicit finally for friend from function ' /* e-f */
          + 'get global goto group handles if implements imports in inherits interface into iterator ' /* g-i */
          + 'join key let lib loop me mid module mustinherit mustoverride mybase myclass ' /* j-m */
          + 'namespace narrowing new next notinheritable notoverridable ' /* n */
          + 'of off on operator option optional order overloads overridable overrides ' /* o */
          + 'paramarray partial preserve private property protected public ' /* p */
          + 'raiseevent readonly redim removehandler resume return ' /* r */
          + 'select set shadows shared skip static step stop structure strict sub synclock ' /* s */
          + 'take text then throw to try unicode until using when where while widening with withevents writeonly yield' /* t-y */,
        built_in:
          // Operators https://docs.microsoft.com/dotnet/visual-basic/language-reference/operators
          'addressof and andalso await directcast gettype getxmlnamespace is isfalse isnot istrue like mod nameof new not or orelse trycast typeof xor '
          // Type Conversion Functions https://docs.microsoft.com/dotnet/visual-basic/language-reference/functions/type-conversion-functions
          + 'cbool cbyte cchar cdate cdbl cdec cint clng cobj csbyte cshort csng cstr cuint culng cushort',
        type:
          // Data types https://docs.microsoft.com/dotnet/visual-basic/language-reference/data-types
          'boolean byte char date decimal double integer long object sbyte short single string uinteger ulong ushort',
        literal: 'true false nothing'
      },
      illegal:
        '//|\\{|\\}|endif|gosub|variant|wend|^\\$ ' /* reserved deprecated keywords */,
      contains: [
        CHARACTER,
        STRING,
        DATE,
        NUMBER,
        LABEL,
        DOC_COMMENT,
        COMMENT,
        DIRECTIVES
      ]
    };
  }

  return vbnet;

})();

    hljs.registerLanguage('vbnet', hljsGrammar);
  })();/*! `vbscript` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: VBScript
  Description: VBScript ("Microsoft Visual Basic Scripting Edition") is an Active Scripting language developed by Microsoft that is modeled on Visual Basic.
  Author: Nikita Ledyaev <lenikita@yandex.ru>
  Contributors: Michal Gabrukiewicz <mgabru@gmail.com>
  Website: https://en.wikipedia.org/wiki/VBScript
  Category: scripting
  */

  /** @type LanguageFn */
  function vbscript(hljs) {
    const regex = hljs.regex;
    const BUILT_IN_FUNCTIONS = [
      "lcase",
      "month",
      "vartype",
      "instrrev",
      "ubound",
      "setlocale",
      "getobject",
      "rgb",
      "getref",
      "string",
      "weekdayname",
      "rnd",
      "dateadd",
      "monthname",
      "now",
      "day",
      "minute",
      "isarray",
      "cbool",
      "round",
      "formatcurrency",
      "conversions",
      "csng",
      "timevalue",
      "second",
      "year",
      "space",
      "abs",
      "clng",
      "timeserial",
      "fixs",
      "len",
      "asc",
      "isempty",
      "maths",
      "dateserial",
      "atn",
      "timer",
      "isobject",
      "filter",
      "weekday",
      "datevalue",
      "ccur",
      "isdate",
      "instr",
      "datediff",
      "formatdatetime",
      "replace",
      "isnull",
      "right",
      "sgn",
      "array",
      "snumeric",
      "log",
      "cdbl",
      "hex",
      "chr",
      "lbound",
      "msgbox",
      "ucase",
      "getlocale",
      "cos",
      "cdate",
      "cbyte",
      "rtrim",
      "join",
      "hour",
      "oct",
      "typename",
      "trim",
      "strcomp",
      "int",
      "createobject",
      "loadpicture",
      "tan",
      "formatnumber",
      "mid",
      "split",
      "cint",
      "sin",
      "datepart",
      "ltrim",
      "sqr",
      "time",
      "derived",
      "eval",
      "date",
      "formatpercent",
      "exp",
      "inputbox",
      "left",
      "ascw",
      "chrw",
      "regexp",
      "cstr",
      "err"
    ];
    const BUILT_IN_OBJECTS = [
      "server",
      "response",
      "request",
      // take no arguments so can be called without ()
      "scriptengine",
      "scriptenginebuildversion",
      "scriptengineminorversion",
      "scriptenginemajorversion"
    ];

    const BUILT_IN_CALL = {
      begin: regex.concat(regex.either(...BUILT_IN_FUNCTIONS), "\\s*\\("),
      // relevance 0 because this is acting as a beginKeywords really
      relevance: 0,
      keywords: { built_in: BUILT_IN_FUNCTIONS }
    };

    const LITERALS = [
      "true",
      "false",
      "null",
      "nothing",
      "empty"
    ];

    const KEYWORDS = [
      "call",
      "class",
      "const",
      "dim",
      "do",
      "loop",
      "erase",
      "execute",
      "executeglobal",
      "exit",
      "for",
      "each",
      "next",
      "function",
      "if",
      "then",
      "else",
      "on",
      "error",
      "option",
      "explicit",
      "new",
      "private",
      "property",
      "let",
      "get",
      "public",
      "randomize",
      "redim",
      "rem",
      "select",
      "case",
      "set",
      "stop",
      "sub",
      "while",
      "wend",
      "with",
      "end",
      "to",
      "elseif",
      "is",
      "or",
      "xor",
      "and",
      "not",
      "class_initialize",
      "class_terminate",
      "default",
      "preserve",
      "in",
      "me",
      "byval",
      "byref",
      "step",
      "resume",
      "goto"
    ];

    return {
      name: 'VBScript',
      aliases: [ 'vbs' ],
      case_insensitive: true,
      keywords: {
        keyword: KEYWORDS,
        built_in: BUILT_IN_OBJECTS,
        literal: LITERALS
      },
      illegal: '//',
      contains: [
        BUILT_IN_CALL,
        hljs.inherit(hljs.QUOTE_STRING_MODE, { contains: [ { begin: '""' } ] }),
        hljs.COMMENT(
          /'/,
          /$/,
          { relevance: 0 }
        ),
        hljs.C_NUMBER_MODE
      ]
    };
  }

  return vbscript;

})();

    hljs.registerLanguage('vbscript', hljsGrammar);
  })();/*! `verilog` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Verilog
  Author: Jon Evans <jon@craftyjon.com>
  Contributors: Boone Severson <boone.severson@gmail.com>
  Description: Verilog is a hardware description language used in electronic design automation to describe digital and mixed-signal systems. This highlighter supports Verilog and SystemVerilog through IEEE 1800-2012.
  Website: http://www.verilog.com
  Category: hardware
  */

  function verilog(hljs) {
    const regex = hljs.regex;
    const KEYWORDS = {
      $pattern: /\$?[\w]+(\$[\w]+)*/,
      keyword: [
        "accept_on",
        "alias",
        "always",
        "always_comb",
        "always_ff",
        "always_latch",
        "and",
        "assert",
        "assign",
        "assume",
        "automatic",
        "before",
        "begin",
        "bind",
        "bins",
        "binsof",
        "bit",
        "break",
        "buf|0",
        "bufif0",
        "bufif1",
        "byte",
        "case",
        "casex",
        "casez",
        "cell",
        "chandle",
        "checker",
        "class",
        "clocking",
        "cmos",
        "config",
        "const",
        "constraint",
        "context",
        "continue",
        "cover",
        "covergroup",
        "coverpoint",
        "cross",
        "deassign",
        "default",
        "defparam",
        "design",
        "disable",
        "dist",
        "do",
        "edge",
        "else",
        "end",
        "endcase",
        "endchecker",
        "endclass",
        "endclocking",
        "endconfig",
        "endfunction",
        "endgenerate",
        "endgroup",
        "endinterface",
        "endmodule",
        "endpackage",
        "endprimitive",
        "endprogram",
        "endproperty",
        "endspecify",
        "endsequence",
        "endtable",
        "endtask",
        "enum",
        "event",
        "eventually",
        "expect",
        "export",
        "extends",
        "extern",
        "final",
        "first_match",
        "for",
        "force",
        "foreach",
        "forever",
        "fork",
        "forkjoin",
        "function",
        "generate|5",
        "genvar",
        "global",
        "highz0",
        "highz1",
        "if",
        "iff",
        "ifnone",
        "ignore_bins",
        "illegal_bins",
        "implements",
        "implies",
        "import",
        "incdir",
        "include",
        "initial",
        "inout",
        "input",
        "inside",
        "instance",
        "int",
        "integer",
        "interconnect",
        "interface",
        "intersect",
        "join",
        "join_any",
        "join_none",
        "large",
        "let",
        "liblist",
        "library",
        "local",
        "localparam",
        "logic",
        "longint",
        "macromodule",
        "matches",
        "medium",
        "modport",
        "module",
        "nand",
        "negedge",
        "nettype",
        "new",
        "nexttime",
        "nmos",
        "nor",
        "noshowcancelled",
        "not",
        "notif0",
        "notif1",
        "or",
        "output",
        "package",
        "packed",
        "parameter",
        "pmos",
        "posedge",
        "primitive",
        "priority",
        "program",
        "property",
        "protected",
        "pull0",
        "pull1",
        "pulldown",
        "pullup",
        "pulsestyle_ondetect",
        "pulsestyle_onevent",
        "pure",
        "rand",
        "randc",
        "randcase",
        "randsequence",
        "rcmos",
        "real",
        "realtime",
        "ref",
        "reg",
        "reject_on",
        "release",
        "repeat",
        "restrict",
        "return",
        "rnmos",
        "rpmos",
        "rtran",
        "rtranif0",
        "rtranif1",
        "s_always",
        "s_eventually",
        "s_nexttime",
        "s_until",
        "s_until_with",
        "scalared",
        "sequence",
        "shortint",
        "shortreal",
        "showcancelled",
        "signed",
        "small",
        "soft",
        "solve",
        "specify",
        "specparam",
        "static",
        "string",
        "strong",
        "strong0",
        "strong1",
        "struct",
        "super",
        "supply0",
        "supply1",
        "sync_accept_on",
        "sync_reject_on",
        "table",
        "tagged",
        "task",
        "this",
        "throughout",
        "time",
        "timeprecision",
        "timeunit",
        "tran",
        "tranif0",
        "tranif1",
        "tri",
        "tri0",
        "tri1",
        "triand",
        "trior",
        "trireg",
        "type",
        "typedef",
        "union",
        "unique",
        "unique0",
        "unsigned",
        "until",
        "until_with",
        "untyped",
        "use",
        "uwire",
        "var",
        "vectored",
        "virtual",
        "void",
        "wait",
        "wait_order",
        "wand",
        "weak",
        "weak0",
        "weak1",
        "while",
        "wildcard",
        "wire",
        "with",
        "within",
        "wor",
        "xnor",
        "xor"
      ],
      literal: [ 'null' ],
      built_in: [
        "$finish",
        "$stop",
        "$exit",
        "$fatal",
        "$error",
        "$warning",
        "$info",
        "$realtime",
        "$time",
        "$printtimescale",
        "$bitstoreal",
        "$bitstoshortreal",
        "$itor",
        "$signed",
        "$cast",
        "$bits",
        "$stime",
        "$timeformat",
        "$realtobits",
        "$shortrealtobits",
        "$rtoi",
        "$unsigned",
        "$asserton",
        "$assertkill",
        "$assertpasson",
        "$assertfailon",
        "$assertnonvacuouson",
        "$assertoff",
        "$assertcontrol",
        "$assertpassoff",
        "$assertfailoff",
        "$assertvacuousoff",
        "$isunbounded",
        "$sampled",
        "$fell",
        "$changed",
        "$past_gclk",
        "$fell_gclk",
        "$changed_gclk",
        "$rising_gclk",
        "$steady_gclk",
        "$coverage_control",
        "$coverage_get",
        "$coverage_save",
        "$set_coverage_db_name",
        "$rose",
        "$stable",
        "$past",
        "$rose_gclk",
        "$stable_gclk",
        "$future_gclk",
        "$falling_gclk",
        "$changing_gclk",
        "$display",
        "$coverage_get_max",
        "$coverage_merge",
        "$get_coverage",
        "$load_coverage_db",
        "$typename",
        "$unpacked_dimensions",
        "$left",
        "$low",
        "$increment",
        "$clog2",
        "$ln",
        "$log10",
        "$exp",
        "$sqrt",
        "$pow",
        "$floor",
        "$ceil",
        "$sin",
        "$cos",
        "$tan",
        "$countbits",
        "$onehot",
        "$isunknown",
        "$fatal",
        "$warning",
        "$dimensions",
        "$right",
        "$high",
        "$size",
        "$asin",
        "$acos",
        "$atan",
        "$atan2",
        "$hypot",
        "$sinh",
        "$cosh",
        "$tanh",
        "$asinh",
        "$acosh",
        "$atanh",
        "$countones",
        "$onehot0",
        "$error",
        "$info",
        "$random",
        "$dist_chi_square",
        "$dist_erlang",
        "$dist_exponential",
        "$dist_normal",
        "$dist_poisson",
        "$dist_t",
        "$dist_uniform",
        "$q_initialize",
        "$q_remove",
        "$q_exam",
        "$async$and$array",
        "$async$nand$array",
        "$async$or$array",
        "$async$nor$array",
        "$sync$and$array",
        "$sync$nand$array",
        "$sync$or$array",
        "$sync$nor$array",
        "$q_add",
        "$q_full",
        "$psprintf",
        "$async$and$plane",
        "$async$nand$plane",
        "$async$or$plane",
        "$async$nor$plane",
        "$sync$and$plane",
        "$sync$nand$plane",
        "$sync$or$plane",
        "$sync$nor$plane",
        "$system",
        "$display",
        "$displayb",
        "$displayh",
        "$displayo",
        "$strobe",
        "$strobeb",
        "$strobeh",
        "$strobeo",
        "$write",
        "$readmemb",
        "$readmemh",
        "$writememh",
        "$value$plusargs",
        "$dumpvars",
        "$dumpon",
        "$dumplimit",
        "$dumpports",
        "$dumpportson",
        "$dumpportslimit",
        "$writeb",
        "$writeh",
        "$writeo",
        "$monitor",
        "$monitorb",
        "$monitorh",
        "$monitoro",
        "$writememb",
        "$dumpfile",
        "$dumpoff",
        "$dumpall",
        "$dumpflush",
        "$dumpportsoff",
        "$dumpportsall",
        "$dumpportsflush",
        "$fclose",
        "$fdisplay",
        "$fdisplayb",
        "$fdisplayh",
        "$fdisplayo",
        "$fstrobe",
        "$fstrobeb",
        "$fstrobeh",
        "$fstrobeo",
        "$swrite",
        "$swriteb",
        "$swriteh",
        "$swriteo",
        "$fscanf",
        "$fread",
        "$fseek",
        "$fflush",
        "$feof",
        "$fopen",
        "$fwrite",
        "$fwriteb",
        "$fwriteh",
        "$fwriteo",
        "$fmonitor",
        "$fmonitorb",
        "$fmonitorh",
        "$fmonitoro",
        "$sformat",
        "$sformatf",
        "$fgetc",
        "$ungetc",
        "$fgets",
        "$sscanf",
        "$rewind",
        "$ftell",
        "$ferror"
      ]
    };
    const BUILT_IN_CONSTANTS = [
      "__FILE__",
      "__LINE__"
    ];
    const DIRECTIVES = [
      "begin_keywords",
      "celldefine",
      "default_nettype",
      "default_decay_time",
      "default_trireg_strength",
      "define",
      "delay_mode_distributed",
      "delay_mode_path",
      "delay_mode_unit",
      "delay_mode_zero",
      "else",
      "elsif",
      "end_keywords",
      "endcelldefine",
      "endif",
      "ifdef",
      "ifndef",
      "include",
      "line",
      "nounconnected_drive",
      "pragma",
      "resetall",
      "timescale",
      "unconnected_drive",
      "undef",
      "undefineall"
    ];

    return {
      name: 'Verilog',
      aliases: [
        'v',
        'sv',
        'svh'
      ],
      case_insensitive: false,
      keywords: KEYWORDS,
      contains: [
        hljs.C_BLOCK_COMMENT_MODE,
        hljs.C_LINE_COMMENT_MODE,
        hljs.QUOTE_STRING_MODE,
        {
          scope: 'number',
          contains: [ hljs.BACKSLASH_ESCAPE ],
          variants: [
            { begin: /\b((\d+'([bhodBHOD]))[0-9xzXZa-fA-F_]+)/ },
            { begin: /\B(('([bhodBHOD]))[0-9xzXZa-fA-F_]+)/ },
            { // decimal
              begin: /\b[0-9][0-9_]*/,
              relevance: 0
            }
          ]
        },
        /* parameters to instances */
        {
          scope: 'variable',
          variants: [
            { begin: '#\\((?!parameter).+\\)' },
            {
              begin: '\\.\\w+',
              relevance: 0
            }
          ]
        },
        {
          scope: 'variable.constant',
          match: regex.concat(/`/, regex.either(...BUILT_IN_CONSTANTS)),
        },
        {
          scope: 'meta',
          begin: regex.concat(/`/, regex.either(...DIRECTIVES)),
          end: /$|\/\/|\/\*/,
          returnEnd: true,
          keywords: DIRECTIVES
        }
      ]
    };
  }

  return verilog;

})();

    hljs.registerLanguage('verilog', hljsGrammar);
  })();/*! `vim` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Vim Script
  Author: Jun Yang <yangjvn@126.com>
  Description: full keyword and built-in from http://vimdoc.sourceforge.net/htmldoc/
  Website: https://www.vim.org
  Category: scripting
  */

  function vim(hljs) {
    return {
      name: 'Vim Script',
      keywords: {
        $pattern: /[!#@\w]+/,
        keyword:
          // express version except: ! & * < = > !! # @ @@
          'N|0 P|0 X|0 a|0 ab abc abo al am an|0 ar arga argd arge argdo argg argl argu as au aug aun b|0 bN ba bad bd be bel bf bl bm bn bo bp br brea breaka breakd breakl bro bufdo buffers bun bw c|0 cN cNf ca cabc caddb cad caddf cal cat cb cc ccl cd ce cex cf cfir cgetb cgete cg changes chd che checkt cl cla clo cm cmapc cme cn cnew cnf cno cnorea cnoreme co col colo com comc comp con conf cope '
          + 'cp cpf cq cr cs cst cu cuna cunme cw delm deb debugg delc delf dif diffg diffo diffp diffpu diffs diffthis dig di dl dell dj dli do doautoa dp dr ds dsp e|0 ea ec echoe echoh echom echon el elsei em en endfo endf endt endw ene ex exe exi exu f|0 files filet fin fina fini fir fix fo foldc foldd folddoc foldo for fu go gr grepa gu gv ha helpf helpg helpt hi hid his ia iabc if ij il im imapc '
          + 'ime ino inorea inoreme int is isp iu iuna iunme j|0 ju k|0 keepa kee keepj lN lNf l|0 lad laddb laddf la lan lat lb lc lch lcl lcs le lefta let lex lf lfir lgetb lgete lg lgr lgrepa lh ll lla lli lmak lm lmapc lne lnew lnf ln loadk lo loc lockv lol lope lp lpf lr ls lt lu lua luad luaf lv lvimgrepa lw m|0 ma mak map mapc marks mat me menut mes mk mks mksp mkv mkvie mod mz mzf nbc nb nbs new nm nmapc nme nn nnoreme noa no noh norea noreme norm nu nun nunme ol o|0 om omapc ome on ono onoreme opt ou ounme ow p|0 '
          + 'profd prof pro promptr pc ped pe perld po popu pp pre prev ps pt ptN ptf ptj ptl ptn ptp ptr pts pu pw py3 python3 py3d py3f py pyd pyf quita qa rec red redi redr redraws reg res ret retu rew ri rightb rub rubyd rubyf rund ru rv sN san sa sal sav sb sbN sba sbf sbl sbm sbn sbp sbr scrip scripte scs se setf setg setl sf sfir sh sim sig sil sl sla sm smap smapc sme sn sni sno snor snoreme sor '
          + 'so spelld spe spelli spellr spellu spellw sp spr sre st sta startg startr star stopi stj sts sun sunm sunme sus sv sw sy synti sync tN tabN tabc tabdo tabe tabf tabfir tabl tabm tabnew '
          + 'tabn tabo tabp tabr tabs tab ta tags tc tcld tclf te tf th tj tl tm tn to tp tr try ts tu u|0 undoj undol una unh unl unlo unm unme uns up ve verb vert vim vimgrepa vi viu vie vm vmapc vme vne vn vnoreme vs vu vunme windo w|0 wN wa wh wi winc winp wn wp wq wqa ws wu wv x|0 xa xmapc xm xme xn xnoreme xu xunme y|0 z|0 ~ '
          // full version
          + 'Next Print append abbreviate abclear aboveleft all amenu anoremenu args argadd argdelete argedit argglobal arglocal argument ascii autocmd augroup aunmenu buffer bNext ball badd bdelete behave belowright bfirst blast bmodified bnext botright bprevious brewind break breakadd breakdel breaklist browse bunload '
          + 'bwipeout change cNext cNfile cabbrev cabclear caddbuffer caddexpr caddfile call catch cbuffer cclose center cexpr cfile cfirst cgetbuffer cgetexpr cgetfile chdir checkpath checktime clist clast close cmap cmapclear cmenu cnext cnewer cnfile cnoremap cnoreabbrev cnoremenu copy colder colorscheme command comclear compiler continue confirm copen cprevious cpfile cquit crewind cscope cstag cunmap '
          + 'cunabbrev cunmenu cwindow delete delmarks debug debuggreedy delcommand delfunction diffupdate diffget diffoff diffpatch diffput diffsplit digraphs display deletel djump dlist doautocmd doautoall deletep drop dsearch dsplit edit earlier echo echoerr echohl echomsg else elseif emenu endif endfor '
          + 'endfunction endtry endwhile enew execute exit exusage file filetype find finally finish first fixdel fold foldclose folddoopen folddoclosed foldopen function global goto grep grepadd gui gvim hardcopy help helpfind helpgrep helptags highlight hide history insert iabbrev iabclear ijump ilist imap '
          + 'imapclear imenu inoremap inoreabbrev inoremenu intro isearch isplit iunmap iunabbrev iunmenu join jumps keepalt keepmarks keepjumps lNext lNfile list laddexpr laddbuffer laddfile last language later lbuffer lcd lchdir lclose lcscope left leftabove lexpr lfile lfirst lgetbuffer lgetexpr lgetfile lgrep lgrepadd lhelpgrep llast llist lmake lmap lmapclear lnext lnewer lnfile lnoremap loadkeymap loadview '
          + 'lockmarks lockvar lolder lopen lprevious lpfile lrewind ltag lunmap luado luafile lvimgrep lvimgrepadd lwindow move mark make mapclear match menu menutranslate messages mkexrc mksession mkspell mkvimrc mkview mode mzscheme mzfile nbclose nbkey nbsart next nmap nmapclear nmenu nnoremap '
          + 'nnoremenu noautocmd noremap nohlsearch noreabbrev noremenu normal number nunmap nunmenu oldfiles open omap omapclear omenu only onoremap onoremenu options ounmap ounmenu ownsyntax print profdel profile promptfind promptrepl pclose pedit perl perldo pop popup ppop preserve previous psearch ptag ptNext '
          + 'ptfirst ptjump ptlast ptnext ptprevious ptrewind ptselect put pwd py3do py3file python pydo pyfile quit quitall qall read recover redo redir redraw redrawstatus registers resize retab return rewind right rightbelow ruby rubydo rubyfile rundo runtime rviminfo substitute sNext sandbox sargument sall saveas sbuffer sbNext sball sbfirst sblast sbmodified sbnext sbprevious sbrewind scriptnames scriptencoding '
          + 'scscope set setfiletype setglobal setlocal sfind sfirst shell simalt sign silent sleep slast smagic smapclear smenu snext sniff snomagic snoremap snoremenu sort source spelldump spellgood spellinfo spellrepall spellundo spellwrong split sprevious srewind stop stag startgreplace startreplace '
          + 'startinsert stopinsert stjump stselect sunhide sunmap sunmenu suspend sview swapname syntax syntime syncbind tNext tabNext tabclose tabedit tabfind tabfirst tablast tabmove tabnext tabonly tabprevious tabrewind tag tcl tcldo tclfile tearoff tfirst throw tjump tlast tmenu tnext topleft tprevious ' + 'trewind tselect tunmenu undo undojoin undolist unabbreviate unhide unlet unlockvar unmap unmenu unsilent update vglobal version verbose vertical vimgrep vimgrepadd visual viusage view vmap vmapclear vmenu vnew '
          + 'vnoremap vnoremenu vsplit vunmap vunmenu write wNext wall while winsize wincmd winpos wnext wprevious wqall wsverb wundo wviminfo xit xall xmapclear xmap xmenu xnoremap xnoremenu xunmap xunmenu yank',
        built_in: // built in func
          'synIDtrans atan2 range matcharg did_filetype asin feedkeys xor argv '
          + 'complete_check add getwinposx getqflist getwinposy screencol '
          + 'clearmatches empty extend getcmdpos mzeval garbagecollect setreg '
          + 'ceil sqrt diff_hlID inputsecret get getfperm getpid filewritable '
          + 'shiftwidth max sinh isdirectory synID system inputrestore winline '
          + 'atan visualmode inputlist tabpagewinnr round getregtype mapcheck '
          + 'hasmapto histdel argidx findfile sha256 exists toupper getcmdline '
          + 'taglist string getmatches bufnr strftime winwidth bufexists '
          + 'strtrans tabpagebuflist setcmdpos remote_read printf setloclist '
          + 'getpos getline bufwinnr float2nr len getcmdtype diff_filler luaeval '
          + 'resolve libcallnr foldclosedend reverse filter has_key bufname '
          + 'str2float strlen setline getcharmod setbufvar index searchpos '
          + 'shellescape undofile foldclosed setqflist buflisted strchars str2nr '
          + 'virtcol floor remove undotree remote_expr winheight gettabwinvar '
          + 'reltime cursor tabpagenr finddir localtime acos getloclist search '
          + 'tanh matchend rename gettabvar strdisplaywidth type abs py3eval '
          + 'setwinvar tolower wildmenumode log10 spellsuggest bufloaded '
          + 'synconcealed nextnonblank server2client complete settabwinvar '
          + 'executable input wincol setmatches getftype hlID inputsave '
          + 'searchpair or screenrow line settabvar histadd deepcopy strpart '
          + 'remote_peek and eval getftime submatch screenchar winsaveview '
          + 'matchadd mkdir screenattr getfontname libcall reltimestr getfsize '
          + 'winnr invert pow getbufline byte2line soundfold repeat fnameescape '
          + 'tagfiles sin strwidth spellbadword trunc maparg log lispindent '
          + 'hostname setpos globpath remote_foreground getchar synIDattr '
          + 'fnamemodify cscope_connection stridx winbufnr indent min '
          + 'complete_add nr2char searchpairpos inputdialog values matchlist '
          + 'items hlexists strridx browsedir expand fmod pathshorten line2byte '
          + 'argc count getwinvar glob foldtextresult getreg foreground cosh '
          + 'matchdelete has char2nr simplify histget searchdecl iconv '
          + 'winrestcmd pumvisible writefile foldlevel haslocaldir keys cos '
          + 'matchstr foldtext histnr tan tempname getcwd byteidx getbufvar '
          + 'islocked escape eventhandler remote_send serverlist winrestview '
          + 'synstack pyeval prevnonblank readfile cindent filereadable changenr '
          + 'exp'
      },
      illegal: /;/,
      contains: [
        hljs.NUMBER_MODE,
        {
          className: 'string',
          begin: '\'',
          end: '\'',
          illegal: '\\n'
        },

        /*
        A double quote can start either a string or a line comment. Strings are
        ended before the end of a line by another double quote and can contain
        escaped double-quotes and post-escaped line breaks.

        Also, any double quote at the beginning of a line is a comment but we
        don't handle that properly at the moment: any double quote inside will
        turn them into a string. Handling it properly will require a smarter
        parser.
        */
        {
          className: 'string',
          begin: /"(\\"|\n\\|[^"\n])*"/
        },
        hljs.COMMENT('"', '$'),

        {
          className: 'variable',
          begin: /[bwtglsav]:[\w\d_]+/
        },
        {
          begin: [
            /\b(?:function|function!)/,
            /\s+/,
            hljs.IDENT_RE
          ],
          className: {
            1: "keyword",
            3: "title"
          },
          end: '$',
          relevance: 0,
          contains: [
            {
              className: 'params',
              begin: '\\(',
              end: '\\)'
            }
          ]
        },
        {
          className: 'symbol',
          begin: /<[\w-]+>/
        }
      ]
    };
  }

  return vim;

})();

    hljs.registerLanguage('vim', hljsGrammar);
  })();/*! `wasm` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: WebAssembly
  Website: https://webassembly.org
  Description:  Wasm is designed as a portable compilation target for programming languages, enabling deployment on the web for client and server applications.
  Category: web, common
  Audit: 2020
  */

  /** @type LanguageFn */
  function wasm(hljs) {
    hljs.regex;
    const BLOCK_COMMENT = hljs.COMMENT(/\(;/, /;\)/);
    BLOCK_COMMENT.contains.push("self");
    const LINE_COMMENT = hljs.COMMENT(/;;/, /$/);

    const KWS = [
      "anyfunc",
      "block",
      "br",
      "br_if",
      "br_table",
      "call",
      "call_indirect",
      "data",
      "drop",
      "elem",
      "else",
      "end",
      "export",
      "func",
      "global.get",
      "global.set",
      "local.get",
      "local.set",
      "local.tee",
      "get_global",
      "get_local",
      "global",
      "if",
      "import",
      "local",
      "loop",
      "memory",
      "memory.grow",
      "memory.size",
      "module",
      "mut",
      "nop",
      "offset",
      "param",
      "result",
      "return",
      "select",
      "set_global",
      "set_local",
      "start",
      "table",
      "tee_local",
      "then",
      "type",
      "unreachable"
    ];

    const FUNCTION_REFERENCE = {
      begin: [
        /(?:func|call|call_indirect)/,
        /\s+/,
        /\$[^\s)]+/
      ],
      className: {
        1: "keyword",
        3: "title.function"
      }
    };

    const ARGUMENT = {
      className: "variable",
      begin: /\$[\w_]+/
    };

    const PARENS = {
      match: /(\((?!;)|\))+/,
      className: "punctuation",
      relevance: 0
    };

    const NUMBER = {
      className: "number",
      relevance: 0,
      // borrowed from Prism, TODO: split out into variants
      match: /[+-]?\b(?:\d(?:_?\d)*(?:\.\d(?:_?\d)*)?(?:[eE][+-]?\d(?:_?\d)*)?|0x[\da-fA-F](?:_?[\da-fA-F])*(?:\.[\da-fA-F](?:_?[\da-fA-D])*)?(?:[pP][+-]?\d(?:_?\d)*)?)\b|\binf\b|\bnan(?::0x[\da-fA-F](?:_?[\da-fA-D])*)?\b/
    };

    const TYPE = {
      // look-ahead prevents us from gobbling up opcodes
      match: /(i32|i64|f32|f64)(?!\.)/,
      className: "type"
    };

    const MATH_OPERATIONS = {
      className: "keyword",
      // borrowed from Prism, TODO: split out into variants
      match: /\b(f32|f64|i32|i64)(?:\.(?:abs|add|and|ceil|clz|const|convert_[su]\/i(?:32|64)|copysign|ctz|demote\/f64|div(?:_[su])?|eqz?|extend_[su]\/i32|floor|ge(?:_[su])?|gt(?:_[su])?|le(?:_[su])?|load(?:(?:8|16|32)_[su])?|lt(?:_[su])?|max|min|mul|nearest|neg?|or|popcnt|promote\/f32|reinterpret\/[fi](?:32|64)|rem_[su]|rot[lr]|shl|shr_[su]|store(?:8|16|32)?|sqrt|sub|trunc(?:_[su]\/f(?:32|64))?|wrap\/i64|xor))\b/
    };

    const OFFSET_ALIGN = {
      match: [
        /(?:offset|align)/,
        /\s*/,
        /=/
      ],
      className: {
        1: "keyword",
        3: "operator"
      }
    };

    return {
      name: 'WebAssembly',
      keywords: {
        $pattern: /[\w.]+/,
        keyword: KWS
      },
      contains: [
        LINE_COMMENT,
        BLOCK_COMMENT,
        OFFSET_ALIGN,
        ARGUMENT,
        PARENS,
        FUNCTION_REFERENCE,
        hljs.QUOTE_STRING_MODE,
        TYPE,
        MATH_OPERATIONS,
        NUMBER
      ]
    };
  }

  return wasm;

})();

    hljs.registerLanguage('wasm', hljsGrammar);
  })();/*! `xml` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: HTML, XML
  Website: https://www.w3.org/XML/
  Category: common, web
  Audit: 2020
  */

  /** @type LanguageFn */
  function xml(hljs) {
    const regex = hljs.regex;
    // XML names can have the following additional letters: https://www.w3.org/TR/xml/#NT-NameChar
    // OTHER_NAME_CHARS = /[:\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]/;
    // Element names start with NAME_START_CHAR followed by optional other Unicode letters, ASCII digits, hyphens, underscores, and periods
    // const TAG_NAME_RE = regex.concat(/[A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]/, regex.optional(/[A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]*:/), /[A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]*/);;
    // const XML_IDENT_RE = /[A-Z_a-z:\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]+/;
    // const TAG_NAME_RE = regex.concat(/[A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]/, regex.optional(/[A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]*:/), /[A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]*/);
    // however, to cater for performance and more Unicode support rely simply on the Unicode letter class
    const TAG_NAME_RE = regex.concat(/[\p{L}_]/u, regex.optional(/[\p{L}0-9_.-]*:/u), /[\p{L}0-9_.-]*/u);
    const XML_IDENT_RE = /[\p{L}0-9._:-]+/u;
    const XML_ENTITIES = {
      className: 'symbol',
      begin: /&[a-z]+;|&#[0-9]+;|&#x[a-f0-9]+;/
    };
    const XML_META_KEYWORDS = {
      begin: /\s/,
      contains: [
        {
          className: 'keyword',
          begin: /#?[a-z_][a-z1-9_-]+/,
          illegal: /\n/
        }
      ]
    };
    const XML_META_PAR_KEYWORDS = hljs.inherit(XML_META_KEYWORDS, {
      begin: /\(/,
      end: /\)/
    });
    const APOS_META_STRING_MODE = hljs.inherit(hljs.APOS_STRING_MODE, { className: 'string' });
    const QUOTE_META_STRING_MODE = hljs.inherit(hljs.QUOTE_STRING_MODE, { className: 'string' });
    const TAG_INTERNALS = {
      endsWithParent: true,
      illegal: /</,
      relevance: 0,
      contains: [
        {
          className: 'attr',
          begin: XML_IDENT_RE,
          relevance: 0
        },
        {
          begin: /=\s*/,
          relevance: 0,
          contains: [
            {
              className: 'string',
              endsParent: true,
              variants: [
                {
                  begin: /"/,
                  end: /"/,
                  contains: [ XML_ENTITIES ]
                },
                {
                  begin: /'/,
                  end: /'/,
                  contains: [ XML_ENTITIES ]
                },
                { begin: /[^\s"'=<>`]+/ }
              ]
            }
          ]
        }
      ]
    };
    return {
      name: 'HTML, XML',
      aliases: [
        'html',
        'xhtml',
        'rss',
        'atom',
        'xjb',
        'xsd',
        'xsl',
        'plist',
        'wsf',
        'svg'
      ],
      case_insensitive: true,
      unicodeRegex: true,
      contains: [
        {
          className: 'meta',
          begin: /<![a-z]/,
          end: />/,
          relevance: 10,
          contains: [
            XML_META_KEYWORDS,
            QUOTE_META_STRING_MODE,
            APOS_META_STRING_MODE,
            XML_META_PAR_KEYWORDS,
            {
              begin: /\[/,
              end: /\]/,
              contains: [
                {
                  className: 'meta',
                  begin: /<![a-z]/,
                  end: />/,
                  contains: [
                    XML_META_KEYWORDS,
                    XML_META_PAR_KEYWORDS,
                    QUOTE_META_STRING_MODE,
                    APOS_META_STRING_MODE
                  ]
                }
              ]
            }
          ]
        },
        hljs.COMMENT(
          /<!--/,
          /-->/,
          { relevance: 10 }
        ),
        {
          begin: /<!\[CDATA\[/,
          end: /\]\]>/,
          relevance: 10
        },
        XML_ENTITIES,
        // xml processing instructions
        {
          className: 'meta',
          end: /\?>/,
          variants: [
            {
              begin: /<\?xml/,
              relevance: 10,
              contains: [
                QUOTE_META_STRING_MODE
              ]
            },
            {
              begin: /<\?[a-z][a-z0-9]+/,
            }
          ]

        },
        {
          className: 'tag',
          /*
          The lookahead pattern (?=...) ensures that 'begin' only matches
          '<style' as a single word, followed by a whitespace or an
          ending bracket.
          */
          begin: /<style(?=\s|>)/,
          end: />/,
          keywords: { name: 'style' },
          contains: [ TAG_INTERNALS ],
          starts: {
            end: /<\/style>/,
            returnEnd: true,
            subLanguage: [
              'css',
              'xml'
            ]
          }
        },
        {
          className: 'tag',
          // See the comment in the <style tag about the lookahead pattern
          begin: /<script(?=\s|>)/,
          end: />/,
          keywords: { name: 'script' },
          contains: [ TAG_INTERNALS ],
          starts: {
            end: /<\/script>/,
            returnEnd: true,
            subLanguage: [
              'javascript',
              'handlebars',
              'xml'
            ]
          }
        },
        // we need this for now for jSX
        {
          className: 'tag',
          begin: /<>|<\/>/
        },
        // open tag
        {
          className: 'tag',
          begin: regex.concat(
            /</,
            regex.lookahead(regex.concat(
              TAG_NAME_RE,
              // <tag/>
              // <tag>
              // <tag ...
              regex.either(/\/>/, />/, /\s/)
            ))
          ),
          end: /\/?>/,
          contains: [
            {
              className: 'name',
              begin: TAG_NAME_RE,
              relevance: 0,
              starts: TAG_INTERNALS
            }
          ]
        },
        // close tag
        {
          className: 'tag',
          begin: regex.concat(
            /<\//,
            regex.lookahead(regex.concat(
              TAG_NAME_RE, />/
            ))
          ),
          contains: [
            {
              className: 'name',
              begin: TAG_NAME_RE,
              relevance: 0
            },
            {
              begin: />/,
              relevance: 0,
              endsParent: true
            }
          ]
        }
      ]
    };
  }

  return xml;

})();

    hljs.registerLanguage('xml', hljsGrammar);
  })();/*! `yaml` grammar compiled for Highlight.js 11.11.1 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: YAML
  Description: Yet Another Markdown Language
  Author: Stefan Wienert <stwienert@gmail.com>
  Contributors: Carl Baxter <carl@cbax.tech>
  Requires: ruby.js
  Website: https://yaml.org
  Category: common, config
  */
  function yaml(hljs) {
    const LITERALS = 'true false yes no null';

    // YAML spec allows non-reserved URI characters in tags.
    const URI_CHARACTERS = '[\\w#;/?:@&=+$,.~*\'()[\\]]+';

    // Define keys as starting with a word character
    // ...containing word chars, spaces, colons, forward-slashes, hyphens and periods
    // ...and ending with a colon followed immediately by a space, tab or newline.
    // The YAML spec allows for much more than this, but this covers most use-cases.
    const KEY = {
      className: 'attr',
      variants: [
        // added brackets support and special char support
        { begin: /[\w*@][\w*@ :()\./-]*:(?=[ \t]|$)/ },
        { // double quoted keys - with brackets and special char support
          begin: /"[\w*@][\w*@ :()\./-]*":(?=[ \t]|$)/ },
        { // single quoted keys - with brackets and special char support
          begin: /'[\w*@][\w*@ :()\./-]*':(?=[ \t]|$)/ },
      ]
    };
    
    const TEMPLATE_VARIABLES = {
      className: 'template-variable',
      variants: [
        { // jinja templates Ansible
          begin: /\{\{/,
          end: /\}\}/
        },
        { // Ruby i18n
          begin: /%\{/,
          end: /\}/
        }
      ]
    };

    const SINGLE_QUOTE_STRING = {
      className: 'string',
      relevance: 0,
      begin: /'/,
      end: /'/,
      contains: [
        {
          match: /''/,
          scope: 'char.escape',
          relevance: 0
        }
      ]
    };

    const STRING = {
      className: 'string',
      relevance: 0,
      variants: [
        {
          begin: /"/,
          end: /"/
        },
        { begin: /\S+/ }
      ],
      contains: [
        hljs.BACKSLASH_ESCAPE,
        TEMPLATE_VARIABLES
      ]
    };

    // Strings inside of value containers (objects) can't contain braces,
    // brackets, or commas
    const CONTAINER_STRING = hljs.inherit(STRING, { variants: [
      {
        begin: /'/,
        end: /'/,
        contains: [
          {
            begin: /''/,
            relevance: 0
          }
        ]
      },
      {
        begin: /"/,
        end: /"/
      },
      { begin: /[^\s,{}[\]]+/ }
    ] });

    const DATE_RE = '[0-9]{4}(-[0-9][0-9]){0,2}';
    const TIME_RE = '([Tt \\t][0-9][0-9]?(:[0-9][0-9]){2})?';
    const FRACTION_RE = '(\\.[0-9]*)?';
    const ZONE_RE = '([ \\t])*(Z|[-+][0-9][0-9]?(:[0-9][0-9])?)?';
    const TIMESTAMP = {
      className: 'number',
      begin: '\\b' + DATE_RE + TIME_RE + FRACTION_RE + ZONE_RE + '\\b'
    };

    const VALUE_CONTAINER = {
      end: ',',
      endsWithParent: true,
      excludeEnd: true,
      keywords: LITERALS,
      relevance: 0
    };
    const OBJECT = {
      begin: /\{/,
      end: /\}/,
      contains: [ VALUE_CONTAINER ],
      illegal: '\\n',
      relevance: 0
    };
    const ARRAY = {
      begin: '\\[',
      end: '\\]',
      contains: [ VALUE_CONTAINER ],
      illegal: '\\n',
      relevance: 0
    };

    const MODES = [
      KEY,
      {
        className: 'meta',
        begin: '^---\\s*$',
        relevance: 10
      },
      { // multi line string
        // Blocks start with a | or > followed by a newline
        //
        // Indentation of subsequent lines must be the same to
        // be considered part of the block
        className: 'string',
        begin: '[\\|>]([1-9]?[+-])?[ ]*\\n( +)[^ ][^\\n]*\\n(\\2[^\\n]+\\n?)*'
      },
      { // Ruby/Rails erb
        begin: '<%[%=-]?',
        end: '[%-]?%>',
        subLanguage: 'ruby',
        excludeBegin: true,
        excludeEnd: true,
        relevance: 0
      },
      { // named tags
        className: 'type',
        begin: '!\\w+!' + URI_CHARACTERS
      },
      // https://yaml.org/spec/1.2/spec.html#id2784064
      { // verbatim tags
        className: 'type',
        begin: '!<' + URI_CHARACTERS + ">"
      },
      { // primary tags
        className: 'type',
        begin: '!' + URI_CHARACTERS
      },
      { // secondary tags
        className: 'type',
        begin: '!!' + URI_CHARACTERS
      },
      { // fragment id &ref
        className: 'meta',
        begin: '&' + hljs.UNDERSCORE_IDENT_RE + '$'
      },
      { // fragment reference *ref
        className: 'meta',
        begin: '\\*' + hljs.UNDERSCORE_IDENT_RE + '$'
      },
      { // array listing
        className: 'bullet',
        // TODO: remove |$ hack when we have proper look-ahead support
        begin: '-(?=[ ]|$)',
        relevance: 0
      },
      hljs.HASH_COMMENT_MODE,
      {
        beginKeywords: LITERALS,
        keywords: { literal: LITERALS }
      },
      TIMESTAMP,
      // numbers are any valid C-style number that
      // sit isolated from other words
      {
        className: 'number',
        begin: hljs.C_NUMBER_RE + '\\b',
        relevance: 0
      },
      OBJECT,
      ARRAY,
      SINGLE_QUOTE_STRING,
      STRING
    ];

    const VALUE_MODES = [ ...MODES ];
    VALUE_MODES.pop();
    VALUE_MODES.push(CONTAINER_STRING);
    VALUE_CONTAINER.contains = VALUE_MODES;

    return {
      name: 'YAML',
      case_insensitive: true,
      aliases: [ 'yml' ],
      contains: MODES
    };
  }

  return yaml;

})();

    hljs.registerLanguage('yaml', hljsGrammar);
  })();