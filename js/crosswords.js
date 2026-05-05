// Settings that we can save
const CONFIGURABLE_SETTINGS = [
  "skip_filled_letters", "arrow_direction", "space_bar", "tab_key",
  "timer_autostart", "gray_completed_clues",
  "confetti_enabled", "notepad_name", "puzzle_size"
];

// Main crossword javascript for the Crossword Nexus HTML5 Solver
(function(global, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory(global);
  } else {
    factory(global, true);
  }
})(
  typeof window !== 'undefined' ? window : this,
  function(window, registerGlobal) {
    'use strict';

    var default_config = {
      color_selected: '#FFD700',
      color_word: '#A7D8FF',
      color_associated: '#FFECA0',
      color_none: '#FFFFFF',
      background_color_clue: '#FFD700',
      font_color_fill: '#000000',
      puzzle_file: null,

      puzzle_object: null, // jsxw to load, if available
      puzzles: null,
      skip_filled_letters: true,
      arrow_direction: 'arrow_stay',
      space_bar: 'space_clear',
      timer_autostart: true,
      confetti_enabled: true,
      tab_key: 'tab_noskip',
      bar_linewidth: 3.2,
      gray_completed_clues: false,
      min_sidebar_clue_width: 220,
      save_game_limit: 100,
      notepad_name: 'Notes',
      downsOnly: false,
      puzzle_size: 'puzzle_size_standard'
    };

    // constants
    var FILE_JPZ = 'jpz';
    var FILE_PUZ = 'puz';
    var MIN_SIZE = 10;
    var MAX_SIZE = 100;
    var SKIP_UP = 'up';
    var SKIP_DOWN = 'down';
    var SKIP_LEFT = 'left';
    var SKIP_RIGHT = 'right';
    var STORAGE_KEY = 'crossword_nexus_savegame';
    var SETTINGS_STORAGE_KEY = 'crossword_nexus_settings';

    // messages
    var MSG_SAVED = 'Crossword saved';
    var MSG_LOADED = 'Crossword loaded';

    var MAX_CLUES_LENGTH = 2;

    var TYPE_UNDEFINED = typeof undefined;
    var XMLDOM_ELEMENT = 1;
    var XMLDOM_TEXT = 3;
    var ZIPJS_CONFIG_OPTION = 'zipjs_path';
    var ZIPJS_PATH = 'lib/zip';

    // errors
    var ERR_FILE_LOAD = 'Error loading file';
    var ERR_PARSE_JPZ = 'Error parsing JPZ file... Not JPZ or zipped JPZ file.';
    var ERR_NOT_CROSSWORD = 'Error opening file. Probably not a crossword.';
    var ERR_NO_JQUERY = 'jQuery not found';
    var ERR_CLUES_GROUPS = 'Wrong number of clues in jpz file';
    var ERR_NO_PUZJS = 'Puz js not found';
    var ERR_LOAD = 'Error loading savegame - probably corrupted';
    var ERR_NO_SAVEGAME = 'No saved game found';

    var load_error = false;

    var CROSSWORD_TYPES = ['crossword'];
    const FILE_ACCEPT_EXTENSIONS = '.puz,.xml,.jpz,.xpz,.ipuz,.cfp';
    const IS_IPAD_SAFARI_OR_FIREFOX = (function() {
      if (typeof navigator === 'undefined') {
        return false;
      }
      const ua = navigator.userAgent || '';
      const platform = navigator.platform || '';
      const isIpad =
        ua.includes('iPad') ||
        (platform === 'MacIntel' && navigator.maxTouchPoints && navigator.maxTouchPoints > 1);
      if (!isIpad) {
        return false;
      }
      const isSafari =
        /\bSafari\b/i.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
      const isFirefox = /FxiOS|Firefox/i.test(ua);
      return isSafari || isFirefox;
    })();
    var xw_timer,
      xw_timer_seconds = 0;

    /** Template will have to change along with CSS **/
    var template = `
      <div class = "cw-main auto normal">
        <!-- Overlay for opening puzzles -->
        <div class = "cw-open-holder">
        <div class="cw-overflow"></div>
          <div class="cw-open-puzzle">
            <div class="cw-open-puzzle-instructions">
              Drag and drop a file here, or click the button to choose a file
              to open.
            </div>
            <button type = "button" class = "cw-button cw-button-open-puzzle">
              Open puzzle file
            </button>
            <div class = "cw-open-puzzle-formats">
              <b>Accepted formats: </b> PUZ, JPZ, XML, CFP, and iPUZ (partial)
            </div>
            <button id="installAppBtn" style="display: none; margin-top: 1.5rem;">
              📥 Install this app for offline solving
            </button>
          </div>
          <input type = "file" class = "cw-open-jpz">

        </div>
        <!-- End overlay -->
        <div class = "cw-header"></div>
        <div class = "cw-content">
          <!-- Placeholder for modal boxes -->
          <div    class = "cw-modal"></div>
          <div    class = "cw-grid">
            <input type  = "text" class = "cw-hidden-input">
            <div   class = "cw-canvas">
            <div   class = "cw-puzzle-container">
            <div   class = "cw-top-text-wrapper">
            <div   class = "cw-top-text">
            <span  class = "cw-clue-number"></span>
            <span  class = "cw-clue-text"></span>
                    </div>
                  </div>
                  <svg id = "cw-puzzle-grid"></svg>
                </div>
              </div>
              <div class="cw-extra-clues-button-holder"></div>
            </div>
          <div class = "cw-clues-holder"></div>
        </div>
      </div>`;

    // Returns a jQuery Deferred object that resolves to a Uint8Array
    function loadFileFromServer(path, type) {
      const deferred = $.Deferred();
      const xhr = new XMLHttpRequest();

      xhr.open('GET', path);
      xhr.responseType = 'arraybuffer'; // binary-safe for .puz, .jpz, etc.

      xhr.onload = function() {
        if (xhr.status === 200) {
          const data = new Uint8Array(xhr.response);
          deferred.resolve(data);
        } else {
          deferred.reject(ERR_FILE_LOAD);
        }
      };

      xhr.onerror = function() {
        deferred.reject(ERR_FILE_LOAD);
      };

      xhr.send();
      return deferred;
    }

    // Check if we can drag and drop files
    var isAdvancedUpload = (function() {
      var div = document.createElement('div');
      return (
        ('draggable' in div || ('ondragstart' in div && 'ondrop' in div)) &&
        'FormData' in window &&
        'FileReader' in window
      );
    })();

    function loadFromFile(file, type, deferred) {
      const reader = new FileReader();
      deferred = deferred || $.Deferred();

      reader.onload = function(event) {
        const data = new Uint8Array(event.target.result);
        deferred.resolve(data);
      };

      reader.readAsArrayBuffer(file);
      return deferred;
    }

    // Breakpoint config for the top clue, as tuples of `[max_width, max_size]`
    const maxClueSizes = [
      [1080, 15],
      [1200, 17],
      [Infinity, 21],
    ];

    /** Function to resize text **/
    function resizeText(rootElement, nodeList) {
      const minSize = 7;
      const rootWidth = rootElement.width();
      const maxSize = maxClueSizes.find(bp => bp[0] > rootWidth)?.[1] ?? 24;
      const unit = 'px';

      for (var j = 0; j < nodeList.length; j++) {
        const el = nodeList[j];
        const parent = el.parentNode;
        let low = minSize;
        let high = maxSize;
        let best = minSize;

        // binary search for largest size that fits
        while (low <= high) {
          const mid = Math.ceil((low + high) / 2);
          el.style.fontSize = `${mid}${unit}`;

          const overflow = el.scrollHeight > parent.clientHeight ||
            el.scrollWidth > parent.clientWidth;

          if (overflow) {
            high = mid - 1;
          } else {
            best = mid;
            low = mid + 1;
          }
        }
        el.style.fontSize = `${best}${unit}`;
      }
    }


    // Breakpoint widths used by the stylesheet.
    const breakpoints = [420, 600, 650, 850, 1080, 1200];

    function setBreakpointClasses(rootElement) {
      const rootWidth = rootElement.width();

      for (const breakpoint of breakpoints) {
        const className = `cw-max-width-${breakpoint}`;

        if (rootWidth <= breakpoint) {
          rootElement.addClass(className);
        } else {
          rootElement.removeClass(className);
        }
      }
    }

    // Function to check if a cell is solved correctly
    function isCorrect(entry, solution) {
      // if we have a rebus or non-alpha solution or no solution, accept anything
      if (entry && (!solution || solution.length > 1 || /[^A-Za-z]/.test(solution))) {
        return true;
      }
      // otherwise, only mark as okay if we have an exact match
      else {
        return entry == solution;
      }
    }

    /**
     * Sanitize HTML in the given string, except the simplest no-attribute
     * formatting tags.
     */
    const entityMap = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
      '/': '&#x2F;',
      '`': '&#x60;',
      '=': '&#x3D;',
    };
    const escapeRegex = new RegExp(
      `</?(i|b|em|strong|span|br|p)>|[&<>"'\`=\\/]`,
      'g'
    );

    function escape(string) {
      /** This is handled upstream, in JSCrossword **/
      //return String(string).replace(escapeRegex, (s) =>
      //  s.length > 1 ? s : entityMap[s]
      //);
      return string;
    }

    var CrosswordNexus = {
      createCrossword: function(parent, user_config) {
        var crossword;
        try {
          if (typeof jQuery === TYPE_UNDEFINED) {
            throw new Error(ERR_NO_JQUERY);
          }
          crossword = new CrossWord(parent, user_config);
        } catch (e) {
          alert(e.message);
          console.log(e);
        }
        return crossword;
      },
    };

    class CrossWord {
      constructor(parent, user_config) {
        this.parent = parent;
        this.config = {};
        this.saveTimeout = null;
        // Load solver config
        var saved_settings = {};
        try {
          saved_settings = JSON.parse(
            localStorage.getItem(SETTINGS_STORAGE_KEY)
          );
        } catch (error) {
          console.log(error);
        }
        var i;
        var configurable_settings_set = new Set(CONFIGURABLE_SETTINGS);
        for (i in default_config) {
          if (default_config.hasOwnProperty(i)) {
            // Check saved settings before "user" settings
            // only configurable settings can be loaded
            if (saved_settings && saved_settings.hasOwnProperty(i) && configurable_settings_set.has(i)) {
              this.config[i] = saved_settings[i];
            } else if (user_config && user_config.hasOwnProperty(i)) {
              this.config[i] = user_config[i];
            } else {
              this.config[i] = default_config[i];
            }
          }
        }


        /* Update config values based on `color_word` */
        const COLOR_WORD = this.config.color_word;
        const COLOR_SELECTED = this.config.color_selected;
        const COLOR_ASSOCIATED = this.config.color_associated;

        /* Update CSS values based on `color_word` and `color_selected` and `color_associated`*/
        this.updateCSS = (word, selected, associated) => {
          const root = document.documentElement;

          let wordColor = word;
          let selectedColor = selected;
          let associatedColor = associated;

          root.style.setProperty("--grid-selected-square-color", selectedColor);
          root.style.setProperty("--grid-selected-word-color", wordColor);
          root.style.setProperty("--grid-associated-word-color", associatedColor);
          root.style.setProperty("--grid-hilite-color", Color.applyHsvTransform(wordColor, { dh: -2.64, ks: 0.536, kv: 0.976 }));

          // For grid lines inside selected areas in dark mode
          root.style.setProperty("--grid-selected-stroke-color", "var(--grid-stroke-color)");
      

          // Helper for setting dynamic contrast text
          const setContrastText = (varName, bgColor) => {
            const brightness = Color.getBrightness(bgColor);
            root.style.setProperty(varName, brightness < 128 ? "#ffffff" : "#000000");
          };

          // Buttons
          const buttonBgColor = Color.applyHsvTransform(wordColor, { dh: 0.13, ks: 0.753, kv: 1.004 });
          root.style.setProperty("--button-bg-color", buttonBgColor);
          setContrastText("--button-text-color", buttonBgColor);

          const buttonHoverColor = Color.applyHsvTransform(wordColor, { dh: 0.28, ks: 0.502, kv: 1.004 });
          root.style.setProperty("--button-hover-color", buttonHoverColor);
          setContrastText("--button-hover-text-color", buttonHoverColor);

          // Note & Timer Buttons
          const noteBgColor = "#EEEEEE";
          const noteHoverBgColor = "#999999";
          root.style.setProperty("--button-note-timer-bg-color", noteBgColor);
          root.style.setProperty("--button-note-timer-hover-bg-color", noteHoverBgColor);
          root.style.setProperty("--button-note-timer-border", "#888888");
          setContrastText("--button-note-timer-text-color", noteBgColor);
          setContrastText("--button-note-timer-hover-text-color", noteHoverBgColor);

          // Active Timer State
          const runBg = "#90ee90"; // Always green
          const pauseBg = "#ffc107"; // Always amber
          root.style.setProperty("--timer-running-bgcolor", runBg);
          root.style.setProperty("--timer-paused-bgcolor", pauseBg);
          setContrastText("--timer-running-text-color", runBg);
          setContrastText("--timer-paused-text-color", pauseBg);

          // Clues
          let clueActiveColor = Color.applyHsvTransform(wordColor, { dh: 0.13, ks: 0.753, kv: 1.004 });
          root.style.setProperty("--clue-active-color", clueActiveColor);
          setContrastText("--clue-active-text-color", clueActiveColor);

          // Passive clues (same as grid highlight usually)
          const cluePassiveColor = Color.applyHsvTransform(wordColor, { dh: -2.64, ks: 0.536, kv: 0.976 });
          root.style.setProperty("--clue-passive-color", cluePassiveColor);
          setContrastText("--clue-passive-text-color", cluePassiveColor);

          const topTextBgColor = Color.applyHsvTransform(wordColor, { dh: -8.62, ks: 0.157, kv: 1.004 });
          root.style.setProperty("--top-text-wrapper-bg-color", '#FFD700');
          setContrastText("--top-text-wrapper-text-color", topTextBgColor);

          // Scrollbars
          root.style.setProperty("--clue-scrollbar-color-thumb", Color.averageColors(selectedColor, '#333333', 0.5));
        };

        this.updateCSS(COLOR_WORD, COLOR_SELECTED, COLOR_ASSOCIATED);

        this.cell_size = 40;
        this.grid_width = 0;
        this.grid_height = 0;
        this.cells = {};
        this.words = {};

        this.clueGroups = []; // array of clue groups
        this.activeClueGroupIndex = 0;

        this.associated_words = [];
        this.selected_word = null;
        this.selected_cell = null;
        this.settings_open = false;
        this.isModal = false;
        // TIMER
        this.timer_running = false;

        // whether to show the reveal button
        this.has_reveal = true;

        this.handleClickWindow = this.handleClickWindow.bind(this);
        this.windowResized = this.windowResized.bind(this);
        this.updateClueLayout = this.updateClueLayout.bind(this);

        this.init();
      }

      init() {
        var parsePUZZLE_callback = $.proxy(this.parsePuzzle, this);
        var error_callback = $.proxy(this.error, this);

        if (this.root) {
          this.remove();
        }

        // Reset state
        this.activeClueGroupIndex = 0;
        this.selected_word = null;
        this.selected_cell = null;
        this.isSolved = false;
        this.savegame_name = null;
        this.timer_running = false;
        this.xw_timer_seconds = 0;
        xw_timer_seconds = 0; // Reset global timer variable

        this.cells = {};
        this.words = {};
        this.clueGroups = [];

        this.has_reveal = true;
        this.has_check = true;
        this.is_autofill = false;
        this.completion_message = "Puzzle solved!";
        this.notes = new Map();

        // build structures
        this.root = $(template);
        const fileInput = this.root.find('input.cw-open-jpz');
        if (IS_IPAD_SAFARI_OR_FIREFOX) {
          fileInput.removeAttr('accept');
        } else {
          fileInput.attr('accept', FILE_ACCEPT_EXTENSIONS);
        }
        this.top_text = this.root.find('div.cw-top-text');
        this.clues_holder = this.root.find('div.cw-clues-holder');
        this.extra_clues_holder = this.root.find('div.cw-extra-clues-button-holder');
        this.toptext = this.root.find('.cw-top-text-wrapper');

        this.hidden_input = this.root.find('input.cw-hidden-input');

        // function to process uploaded files
        function processFiles(files) {
          loadFromFile(files[0], FILE_PUZ).then(
            function(data) {
              parsePUZZLE_callback(data);
            },
            function(err) {
              error_callback(err);
            }
          );
        }

        // preload one puzzle
        if (
          this.config.puzzle_file &&
          this.config.puzzle_file.hasOwnProperty('url') &&
          this.config.puzzle_file.hasOwnProperty('type')
        ) {
          this.root.addClass('loading');
          var loaded_callback = parsePUZZLE_callback;
          loadFileFromServer(
            this.config.puzzle_file.url,
            this.config.puzzle_file.type
          ).then(loaded_callback, error_callback);
        } else if (this.config.puzzle_object) {
          // Case 2: load from serialized (LZ) puzzle
          console.log("[startup] Loading puzzle from lzpuz param");
          const xw = this.config.puzzle_object;
          Promise.resolve(xw).then(parsePUZZLE_callback, error_callback);
        } else {
          // shows open button
          var i, puzzle_file, el;

          this.open_button = this.root.find('.cw-button-open-puzzle');
          this.file_input = this.root.find('input[type="file"]');

          this.open_button.on('click', () => {
            this.file_input.val('');
            this.file_input.click();
          });

          this.file_input.on('change', () => {
            var files = this.file_input[0].files.length ?
              this.file_input[0].files :
              null;
            if (files) {
              processFiles(files);
            }
          });

          // drag-and-drop
          if (isAdvancedUpload) {
            const div_open_holder = this.root.find('div.cw-open-holder');
            const div_overflow = this.root.find('div.cw-overflow');
            div_overflow.addClass('has-advanced-upload');

            var droppedFiles = false;

            div_open_holder
              .on(
                'drag dragstart dragend dragover dragenter dragleave drop',
                function(e) {
                  e.preventDefault();
                  e.stopPropagation();
                }
              )
              .on('dragover dragenter', function() {
                div_overflow.addClass('is-dragover');
              })
              .on('dragleave dragend drop', function() {
                div_overflow.removeClass('is-dragover');
              })
              .on('drop', function(e) {
                droppedFiles = e.originalEvent.dataTransfer.files;
                processFiles(droppedFiles);
              });
          }
        }

        // mapping of number to cells
        this.number_to_cells = {};
        // the crossword type
        this.crossword_type = 'crossword';
        // whether the puzzle is autofill
        this.is_autofill = false;

        this.root.appendTo(this.parent);
        this.canvas_holder = this.root.find('div.cw-canvas');
        // SVG setup (new)
        this.svgNS = 'http://www.w3.org/2000/svg';
        this.svgContainer = document.createElementNS(this.svgNS, 'svg');
        this.svgContainer.setAttribute('id', 'cw-puzzle-grid');
        // Preserve existing top text wrapper while replacing only the canvas
        this.canvas_holder.find('#cw-puzzle-grid').remove(); // Remove old canvas only

        this.canvas_holder.append(this.svgContainer); // Add new SVG crossword
        this.svg = $('#cw-puzzle-grid');

        setBreakpointClasses(this.root);
        // Place this at the END of the init() method:
        const svg = document.getElementById('cw-puzzle-grid');
      }

      error(message) {
        alert(message);
      }

      normalizeClueTitle(rawTitle) {
        if (!rawTitle) return '';
        const title = rawTitle.trim().toUpperCase();

        if (title === 'ACROSS') return 'ACROSS';
        if (title === 'DOWN') return 'DOWN';

        return rawTitle; // Preserve original if it's custom
      }

      /**
       * Parse puzzle data into Crossword structure.
       *
       * - Accepts either a JSCrossword object or raw string data.
       * - Normalizes coordinates (shift +1 to be 1-indexed).
       * - Detects puzzle type (crossword).
       * - Initializes cells, words, and clues.
       */
      parsePuzzle(data) {
        // if it's already a JSCrossword, return it as-is
        var puzzle;
        if (data instanceof JSCrossword) {
          puzzle = data;
        } else {
          // otherwise, parse it directly -- JSCrossword handles the format detection
          puzzle = JSCrossword.fromData(new Uint8Array(data), {
            lockedHandling: "mask"
          });
        }

        puzzle.kind = puzzle.metadata.kind;

        this.jsxw = puzzle;

        // Expose ipuz string
        window.ipuz = this.jsxw.toIpuzString();

        // Savegame
        const simpleHash = t => {
          let e = 0;
          for (let r = 0; r < t.length; r++) {
            e = (e << 5) - e + t.charCodeAt(r), e &= e
          }
          return new Uint32Array([e])[0].toString(36)
        };
        const myHash = simpleHash(JSON.stringify(puzzle));
        this.savegame_name = STORAGE_KEY + '_' + myHash;
        localStorage.setItem(this.savegame_name + "_lastmodified", Date.now());
        this.cleanupSaves();

        const versionKey = this.savegame_name + '_version';
        const savedVersion = localStorage.getItem(versionKey);

        const jsxw2_cells = this.loadGame();
        if (jsxw2_cells) {
          console.log('Loading puzzle from localStorage');
          var noteObj = JSON.parse(localStorage.getItem(this.savegame_name + "_notes"));
          if (noteObj && noteObj.length > 0) {
            for (var entry of noteObj) {
              this.notes.set(entry.key, entry.value);
            }
          }
          puzzle.cells = jsxw2_cells;
        }

        const loadedFromStorage = Boolean(jsxw2_cells);

        puzzle.cells.forEach(c => {
          if (!c.top_right_number && c['top_right_number']) {
            c.top_right_number = c['top_right_number']; // Ensure key is present consistently
          }
        });

        // Metadata
        this.title = puzzle.metadata.title || '';
        this.author = puzzle.metadata.author || '';
        this.copyright = puzzle.metadata.copyright || '';
        this.crossword_type = puzzle.metadata.crossword_type;
        this.realwords = puzzle.metadata.realwords || false;
        this.is_autofill = puzzle.metadata.autofill || false;
        this.notepad = puzzle.metadata.description || '';
        this.grid_width = puzzle.metadata.width;
        this.grid_height = puzzle.metadata.height;
        this.completion_message = puzzle.metadata.completion_message || "Puzzle solved!";

        if (this.title) {
          document.title = this.title + ' | PuzGod';
        }

        // disable check and reveal in certain cases
        if (puzzle.metadata.has_reveal === false) {
          this.has_reveal = false;
          $('.cw-reveal').css({
            display: 'none'
          });
        }
        if (puzzle.metadata.has_check === false) {
          this.has_check = false;
          $('.cw-check').css({
            display: 'none'
          });
        }

        // === Build cells ===
        this.cells = {};
        this.number_to_cells = {};

        for (var i = 0; i < puzzle.cells.length; i++) {
          const rawCell = puzzle.cells[i];
          const c = {
            x: rawCell.x + 1,
            y: rawCell.y + 1,
            solution: rawCell.solution,
            letter: rawCell.letter || '',
            type: rawCell.type || null,
            number: rawCell.number || null,
            bar: {
              top: rawCell['top-bar'] === true,
              bottom: rawCell['bottom-bar'] === true,
              left: rawCell['left-bar'] === true,
              right: rawCell['right-bar'] === true,
            },
            color: rawCell['background-color'] || null,
            shape: rawCell['background-shape'] || null,
            image: rawCell['image'] || null,
            top_right_number: rawCell.top_right_number,
            fixed: rawCell.fixed === true // Preserve fixed flag from saved data
          };

          /* set a "shade_highlight" color */
          if (c.color && c.color != this.config.color_none) {
            c.shade_highlight_color = Color.averageColors(this.config.color_word, Color.adjustColor(c.color, -50));
          } else {
            c.shade_highlight_color = this.config.color_word;
          }

          /* set the background color for "clue" cells */
          if (rawCell.clue) {
            c.color = this.config.background_color_clue;
          }

          // ✔ DO NOT reset `c.fixed` to false here!

          // Apply rules only if this is a fresh load
          if (!loadedFromStorage && !c.fixed) {
            // Rule 1: Fix punctuation like ‘–’, ‘,’ etc
            if (c.letter && !/[A-Za-z]/.test(c.letter)) {
              c.fixed = true;
            }

            // Rule 2: Fix cells that only have top_right_number (A-Z clue label)
            if (
              /^[A-Z]$/.test(c.letter) &&
              c.top_right_number &&
              c.top_right_number === c.letter
            ) {
              c.fixed = true;
            }

            // Rule 3: Clue label cell in quote rows
            if (
              /^[A-Z]$/.test(c.letter) &&
              !c.top_right_number &&
              c.solution === c.letter
            ) {
              c.fixed = true;
            }
          }

          c.empty = (c.type === 'block' || c.type === 'void' || c.type === 'clue');
          c.clue = (c.type === 'clue');

          if (!this.cells[c.x]) {
            this.cells[c.x] = {};
          }
          this.cells[c.x][c.y] = c;

          const key = c.number || c.top_right_number;
          if (key) {
            if (!this.number_to_cells[key]) {
              this.number_to_cells[key] = [];
            }
            this.number_to_cells[key].push(c);
          }
        }

        // === Build clues ===
        let clueMapping = {};

        // Initialize clue mapping and groups dynamically
        this.clueGroups = [];

        // Defensive: if no clues array exists
        const clueSets = puzzle.clues || [];

        // Create one CluesGroup per clue set
        clueSets.forEach((clueSet, index) => {
          // Normalize title and word IDs
          const title = this.normalizeClueTitle(clueSet.title || `Clue Set ${index + 1}`);
          const clues = clueSet.clue || [];

          // Populate global mapping for quick lookup
          clues.forEach(clue => {
            if (clue.word) clueMapping[clue.word] = clue;
          });

          const words_ids = clues.map(c => c.word);

          // Create and store CluesGroup instance
          const group = new CluesGroup(this, {
            id: `clues_${index}`,
            title,
            clues,
            words_ids
          });

          this.clueGroups.push(group);
        });

        if (this.config.downsOnly && this.clueGroups.length > 0) {
          this.clueGroups[0].clues.forEach(clue => {
            clue.text = '---';
          });
        }

        // Update DOM with clue info
        const holder = document.querySelector('.cw-clues-holder');
        if (!holder) return;

        holder.innerHTML = ''; // clear old ones

        (this.clueGroups).forEach((group, index) => {
          const div = document.createElement('div');
          div.classList.add('cw-clues');
          if (this.config.downsOnly && index === 0) {
            div.style.display = 'none';
          }
          div.dataset.groupId = group.id;

          div.innerHTML = `
            <div class="cw-clues-title">${group.title}</div>
            <div class="cw-clues-items"></div>
          `;

          holder.appendChild(div);
        });

        // === Build words ===
        this.words = {};
        for (var i = 0; i < puzzle.words.length; i++) {
          const word = puzzle.words[i];
          this.words[word.id] = new Word(this, {
            id: word.id,
            dir: word.dir,
            cell_ranges: word.cells.map(function(c) {
              return {
                x: (c[0] + 1).toString(),
                y: (c[1] + 1).toString()
              };
            }),
            clue: clueMapping[word.id]
          });
        }
        this.setAdditionalWordProperties();
        this.completeLoad();
      }

      setAdditionalWordProperties() {
        // === Set word directions based on clue groups ===
        this.clueGroups.forEach(group => {
          // Determine direction from group title
          const dir = group.title.toUpperCase() === 'ACROSS' ? 'Across' : 'Down';
          
          // Set dir on all words in this group, and set each word name
          group.words_ids.forEach(wordId => {
            if (this.words[wordId]) {
              this.words[wordId].dir = dir;
              this.words[wordId].name = this.words[wordId].clue.number + "-" + dir;
            }
          });
        });
      }

      completeLoad() {
        $('.cw-header').html(`
          <table>
          <tr>
          <td class="cw-header-left">
          <span class="cw-title">${escape(this.title)}</span>
          <br>
          <span class="cw-author">${escape(this.author)}</span>
          </td>
          <td class="cw-header-right">
          <span class="cw-button-span">
            <div class="cw-buttons-holder">
      <div class="cw-menu-container">
          <button type="button" class="cw-button">
              File
              <span class="cw-arrow"></span>
          </button>
          <div class="cw-menu">
              <button class="cw-menu-item cw-file-info">Info</button>
              <button class="cw-menu-item cw-file-notepad">Notepad</button>
              <button class="cw-menu-item cw-file-load">Open...</button>
              <button class="cw-menu-item cw-file-print">Print</button>
              <button class="cw-menu-item cw-file-save">Save as iPuz</button>
              <button class="cw-menu-item cw-file-clear">Clear</button>
          </div>
      </div>
      <div class="cw-menu-container cw-check">
          <button type="button" class="cw-button">
              Check
              <span class="cw-arrow"></span>
          </button>
          <div class="cw-menu">
              <button class="cw-menu-item cw-check-letter">Letter</button>
              <button class="cw-menu-item cw-check-word">Word</button>
              <button class="cw-menu-item cw-check-puzzle">Puzzle</button>
          </div>
      </div>
      <div class="cw-menu-container cw-reveal">
          <button type="button" class="cw-button">
              Reveal
              <span class="cw-arrow"></span>
          </button>
          <div class="cw-menu">
              <button class="cw-menu-item cw-reveal-letter">Letter</button>
              <button class="cw-menu-item cw-reveal-word">Word</button>
              <button class="cw-menu-item cw-reveal-puzzle">Puzzle</button>
          </div>
      </div>
      <button type="button" class="cw-button cw-rebus-button">
          Rebus
      </button>
      <button type="button" class="cw-button cw-settings-button">
          Settings
      </button>
      <button type="button" class="cw-button cw-button-timer">00:00</button>
  </div>
          </span>
          </td></tr></table>
          
        `);

        // Reassign button references now that the header HTML has been inserted
        this.settings_btn = this.root.find('.cw-settings-button');
        this.info_btn = this.root.find('.cw-file-info');
        this.load_btn = this.root.find('.cw-file-load');
        this.print_btn = this.root.find('.cw-file-print');
        this.clear_btn = this.root.find('.cw-file-clear');
        this.save_btn = this.root.find('.cw-file-save');
        this.download_btn = this.root.find('.cw-file-download');
        this.notepad_btn = this.root.find('.cw-file-notepad');
        this.rebus_button = this.root.find('.cw-rebus-button');
        this.timer_button = this.root.find('.cw-button-timer');
        this.reveal_letter = this.root.find('.cw-reveal-letter');
        this.reveal_word = this.root.find('.cw-reveal-word');
        this.reveal_puzzle = this.root.find('.cw-reveal-puzzle');
        this.check_letter = this.root.find('.cw-check-letter');
        this.check_word = this.root.find('.cw-check-word');
        this.check_puzzle = this.root.find('.cw-check-puzzle');

        this.notepad_icon = this.root.find('.cw-button-notepad');

        (this.clueGroups || []).forEach(group => {
          // Find the container that matches this group’s ID
          const container = document.querySelector(`.cw-clues[data-group-id="${group.id}"] .cw-clues-items`);
          if (container) {
            const displayGroup = group; // preserve old logic
            this.renderClues(displayGroup, container);
          }
        });

        this.addListeners();
        this.root.removeClass('loading');
        this.root.addClass('loaded');

        this.waitUntilSVGWidthStabilizes(() => {
          if (this.selected_word && this.top_text?.length) {
            resizeText(this.root, this.top_text);
          }
        });
        this.renderCells();
        this.styleClues();

        const first_word = this.clueGroups[this.activeClueGroupIndex].getFirstWord?.();
        if (first_word) {
          this.setActiveWord(first_word);
          const firstCell = first_word.getFirstCell?.();
          if (firstCell) {
            this.setActiveCell(firstCell);
          }
        }

        // Start the timer if necessary
        if (this.config.timer_autostart) {
          this.toggleTimer();
        }

        // and whenever window resizes
        window.removeEventListener('resize', this.updateClueLayout);
        window.addEventListener('resize', this.updateClueLayout);

        // Initial layout pass
        setTimeout(() => {
          this.updateClueLayout();
          this.windowResized();
        }, 100);

      } // end completeLoad

      updateClueLayout() {
        /** Some JS magic to deal with weird numbers of clue lists **/
        const holder = this.clues_holder ? this.clues_holder.get(0) : null;
        if (!holder) return; // nothing to do if it doesn't exist

        const clues = holder.querySelectorAll('.cw-clues');
        if (!clues.length) return;

        // apply layout
        if (this.config.puzzle_size === 'puzzle_size_standard') {
          document.getElementsByClassName("cw-clues-holder")[0].style.maxHeight = '594px';
          document.getElementsByClassName("cw-clues")[0].classList.remove("cw-clue-width-large");
          document.getElementsByClassName("cw-clues")[1].classList.remove("cw-clue-width-large");
          document.getElementsByClassName("cw-clues")[0].classList.add("cw-clue-width-standard");
          document.getElementsByClassName("cw-clues")[1].classList.add("cw-clue-width-standard");
        } else if (this.config.puzzle_size === 'puzzle_size_large') {
          document.getElementsByClassName("cw-clues-holder")[0].style.maxHeight = '788px';
          document.getElementsByClassName("cw-clues")[0].classList.remove("cw-clue-width-standard");
          document.getElementsByClassName("cw-clues")[1].classList.remove("cw-clue-width-standard");
          document.getElementsByClassName("cw-clues")[0].classList.add("cw-clue-width-large");
          document.getElementsByClassName("cw-clues")[1].classList.add("cw-clue-width-large");
        } else {
          document.getElementsByClassName("cw-clues-holder")[0].style.maxHeight  = '100%';
          document.getElementsByClassName("cw-clues")[0].classList.remove("cw-clue-width-standard");
          document.getElementsByClassName("cw-clues")[1].classList.remove("cw-clue-width-standard");
          document.getElementsByClassName("cw-clues")[0].classList.add("cw-clue-width-large");
          document.getElementsByClassName("cw-clues")[1].classList.add("cw-clue-width-large");
        }
        holder.style.flexDirection = 'row';
        clues.forEach(clue => {
          clue.style.width = '';
        });
      }

      remove() {
        this.removeListeners();
        this.root.remove();
      }

      removeGlobalListeners() {
        $(window).off('click', this.handleClickWindow);
        $(window).off('resize', this.windowResized);
        window.removeEventListener('resize', this.updateClueLayout);
      }

      removeListeners() {
        this.removeGlobalListeners();
        this.root.undelegate();
        this.clues_holder.undelegate('div.cw-clues-items span');
        this.svg.off('mousemove click');

        this.reveal_letter.off('click');
        this.reveal_word.off('click');
        this.reveal_puzzle.off('click');

        this.check_letter.off('click');
        this.check_word.off('click');
        this.check_puzzle.off('click');

        this.print_btn.off('click');
        this.clear_btn.off('click');
        this.load_btn.off('click');
        this.save_btn.off('click');
        this.download_btn.off('click');
        this.timer_button.off('click');
        this.rebus_button.off('click');
        this.settings_btn.off('click');

        this.info_btn.off('click');
        this.notepad_btn.off('click');
        this.notepad_icon.off('click');

        this.hidden_input.off('input');
        this.hidden_input.off('keydown');
        $(document).off('keydown');

        // Clear pending saves
        if (this.saveTimeout) {
          clearTimeout(this.saveTimeout);
          this.saveTimeout = null;
        }

        // Stop timer
        if (xw_timer) {
          clearTimeout(xw_timer);
          xw_timer = null;
        }
      }

      addListeners() {
        $(window).off('click', this.handleClickWindow);
        $(window).on('click', this.handleClickWindow);
        $(window).off('resize', this.windowResized);
        $(window).on('resize', this.windowResized);

        this.root.delegate(
          '.cw-menu-container > button',
          'click',
          $.proxy(this.handleClickOpenMenu, this)
        );

        // Click to jump to clue, but DON'T if user just selected text (avoid nuking selection)
        this.clues_holder.delegate(
          'div.cw-clues-items div.cw-clue',
          'click',
          (e) => {
            const sel = window.getSelection && window.getSelection();
            if (sel && sel.toString().trim().length > 0) {
              // User highlighted text; ignore this click so selection stays.
              e.preventDefault();
              e.stopImmediatePropagation();
              return;
            }
            // No selection: proceed with the usual behavior
            this.clueClicked(e);
          }
        );

        this.svg.on('click', $.proxy(this.mouseClicked, this));

        // REVEAL
        this.reveal_letter.on(
          'click',
          $.proxy(this.check_reveal, this, 'letter', 'reveal')
        );
        this.reveal_word.on(
          'click',
          $.proxy(this.check_reveal, this, 'word', 'reveal')
        );
        this.reveal_puzzle.on(
          'click',
          $.proxy(this.check_reveal, this, 'puzzle', 'reveal')
        );

        // CHECK
        this.check_letter.on(
          'click',
          $.proxy(this.check_reveal, this, 'letter', 'check')
        );
        this.check_word.on(
          'click',
          $.proxy(this.check_reveal, this, 'word', 'check')
        );
        this.check_puzzle.on(
          'click',
          $.proxy(this.check_reveal, this, 'puzzle', 'check')
        );

        // PRINTER
        this.print_btn.on('click', (e) => this.printPuzzle(e));

        // CLEAR
        this.clear_btn.on(
          'click',
          $.proxy(this.check_reveal, this, 'puzzle', 'clear')
        );

        // SAVE
        this.save_btn.on('click', $.proxy(this.saveAsIpuz, this));

        // LOAD
        this.load_btn.on('click', () => {
          // Re-initialize to a clean state
          this.init();
          // Reset file input value to allow opening the same file again
          this.file_input.val('');
          this.file_input.click();
        });

        // TIMER
        this.timer_button.on('click', $.proxy(this.toggleTimer, this));

        // REBUS
        this.rebus_button.on('click', $.proxy(this.prepareRebus, this));

        // SETTINGS
        this.settings_btn.on('click', $.proxy(this.openSettings, this));

        // INFO
        this.info_btn.on('click', $.proxy(this.showInfo, this));

        // NOTEPAD
        if (this.notepad) {
          this.notepad_icon.on('click', $.proxy(this.showNotepad, this));
          this.notepad_btn.show();
        } else {
          this.notepad_icon.hide();
        }

        // Automatically show intro on load if it exists
        if (this.jsxw.metadata.intro) {
          setTimeout(() => this.showNotepad(), 300);
        }

        this.notepad_btn.on('click', $.proxy(this.showNotepad, this));

        $(document).off('keydown').on('keydown', $.proxy(this.keyPressed, this));

        this.svgContainer.addEventListener('click', (e) => {
          if (e.target.tagName === 'rect') {
            const x = parseInt(e.target.getAttribute('data-x'));
            const y = parseInt(e.target.getAttribute('data-y'));
            const clickedCell = this.getCell(x, y);

            if (!clickedCell.empty) {
              const groups = this.clueGroups || [];
              const n = groups.length;
              if (!n) return;

              let newActiveWord = null;
              let newGroupIndex = this.activeClueGroupIndex;

              // Try current group first
              const currentGroup = groups[this.activeClueGroupIndex];
              newActiveWord = currentGroup.getMatchingWord(x, y, true);

              // If not found, cycle through remaining groups (2, 3, ..., N, 0, 1, ...)
              if (!newActiveWord) {
                for (let offset = 1; offset < n; offset++) {
                  const i = (this.activeClueGroupIndex + offset) % n;
                  const group = groups[i];
                  const match = group.getMatchingWord(x, y, true);
                  if (match) {
                    newActiveWord = match;
                    newGroupIndex = i;
                    break;
                  }
                }
              }

              if (newActiveWord) {
                this.activeClueGroupIndex = newGroupIndex;
                this.setActiveWord(newActiveWord);
                this.setActiveCell(clickedCell);
              }
            }
          }
        }
      );
      }

      handleClickWindow(event) {
        this.root.find('.cw-menu').removeClass('open');
      }

      handleClickOpenMenu(event) {
        const menuContainer = $(event.target).closest('.cw-menu-container');
        const menu = menuContainer.find('.cw-menu');
        const isAlreadyOpen = menu.hasClass('open');

        // Close all dropdowns first
        this.root.find('.cw-menu').removeClass('open');

        // If it wasn't already open, open this one
        if (!isAlreadyOpen) {
          setTimeout(() => {
            menu.addClass('open');
          });
        }
      }


      // Create a generic modal box with content
      createModalBox(title, content, button_text = 'Close') {
        this.isModal = true;
        // Set the contents of the modal box
        const modalContent = `
        <div class="modal-content">
          <div class="modal-header">
            <span class="modal-close">&times;</span>
            <span class="modal-title">${title}</span>
          </div>
          <div class="modal-body">
            ${content}
          </div>
          <div class="modal-footer">
            <button class="cw-button" id="modal-button">${button_text}</button>
          </div>
        </div>`;
        // Set this to be the contents of the container modal div
        this.root.find('.cw-modal').html(modalContent);

        // Show the div
        var modal = this.root.find('.cw-modal').get(0);
        modal.style.display = 'block';

        // Allow user to close the div
        const this_hidden_input = this.hidden_input;
        const crossword = this; // Capture reference to crossword object
        var span = this.root.find('.modal-close').get(0);
        // When the user clicks on <span> (x), close the modal
        span.onclick = function() {
          crossword.isModal = false;
          modal.style.display = 'none';
          this_hidden_input.focus();
          var isRebus = document.getElementById("rebus-text"); 
          if (isRebus) {
            crossword.hiddenInputChanged(document.getElementById("rebus-text").value);
          }
        };
        // When the user clicks anywhere outside of the modal, close it
        window.onclick = function(event) {
          if (event.target == modal) {
            crossword.isModal = false;
            modal.style.display = 'none';
            this_hidden_input.focus();
            var isRebus = document.getElementById("rebus-text"); 
            if (isRebus) {
              crossword.hiddenInputChanged(document.getElementById("rebus-text").value);
            }
          }
        };
        // Clicking the button should close the modal
        var modalButton = document.getElementById('modal-button');
        modalButton.onclick = function() {
          crossword.isModal = false;
          modal.style.display = 'none';
          this_hidden_input.focus();
          var isRebus = document.getElementById("rebus-text"); 
          if (isRebus) {
            crossword.hiddenInputChanged(document.getElementById("rebus-text").value);
          }
        };
      }

      setConfig(name, value) {
        this.config[name] = value;
      }

      /**
       * Switch active clue group.
       * - If targetIndex is provided, jump there (always).
       * - Otherwise, cycle to the next group that contains the selected cell (if any).
       * - If none match, just stay on the next group.
       */
      changeActiveClues(targetIndex = null) {
        const groups = this.clueGroups || [];
        const n = groups.length;
        if (n <= 1) return;

        let curIndex = this.activeClueGroupIndex ?? 0;
        let newIndex = curIndex;

        if (targetIndex !== null && targetIndex >= 0 && targetIndex < n) {
          // Explicit jump — always allow
          newIndex = targetIndex;
        } else {
          // Cycle forward until we find a group that matches the selected cell
          for (let i = 1; i <= n; i++) {
            const idx = (curIndex + i) % n;
            if (!this.selected_cell) {
              newIndex = idx;
              break;
            }
            const g = groups[idx];
            if (g?.getMatchingWord(this.selected_cell.x, this.selected_cell.y, true)) {
              newIndex = idx;
              break;
            }
            // If we went through all and none matched, default to next anyway
            if (i === n) newIndex = (curIndex + 1) % n;
          }
        }

        // --- Apply the new index ---
        this.activeClueGroupIndex = newIndex;
        const activeGroup = groups[newIndex];

        // --- Update selected word if we have a cell ---
        if (this.selected_cell && activeGroup) {
          const {
            x,
            y
          } = this.selected_cell;
          const word = activeGroup.getMatchingWord(x, y, true);
          if (word) this.setActiveWord(word);
        }

        // --- Refresh sidebar highlighting (optional but recommended) ---
        this.refreshSidebarHighlighting?.();
      }

      getCell(x, y) {
        return this.cells[x] ? this.cells[x][y] : null;
      }

      isAcross(cell_range) {
        return cell_range.every(cell => cell.y === cell_range[0].y);
      }

      setActiveWord(word) {
        if (word) {
          this.setSelectedWord(word);
          const group = this.clueGroups[this.activeClueGroupIndex];
          this.top_text.html(`
            <span class="cw-clue-number">
              ${escape(word.clue.number)}${this.isAcross(word.cell_ranges) ? "A" : "D"}
            </span>
            <span class="cw-clue-text">
              ${escape(word.clue.text)}
            </span>
          `);
          resizeText(this.root, this.top_text);
        }
      }

      //Todo figure this out
      replaceUnderscores(text) {
        // let splits = text.split("_");
        let last = "";
        let result = "";
        for(let i = 0; i < text.length; i++){
          let char = text.charAt(i);
          if(char != '_' || char !== last) {
            result += char;
            last = char;
          }
        }
        console.log(result);

        let underscores = (text.match(new RegExp("_", "g")) || []).length;
        if (underscores > 0 && underscores % 2 == 0) {
          console.log(text);
          let split = text.split('_');
          console.log(split);
        }
        return text;
      }

      setActiveCell(cell) {
        if (!cell || cell.empty) return;

        this.setSelectedCell(cell);

        // Mark active/inactive state for all clue groups
        const groups = this.clueGroups || [];

        groups.forEach(group => {
          // The first param (`isInactive`) is true for all groups except the active one
          const isInactive = group !== this.clueGroups[this.activeClueGroupIndex];
          if (typeof group.markActive === 'function') {
            group.markActive(cell.x, cell.y, isInactive);
          }
        });

        // --- Move and focus hidden input ---
        const offset = this.svg.offset();
        const input_top = offset.top + (cell.y - 1) * this.cell_size;
        const input_left = offset.left + (cell.x - 1) * this.cell_size;

        this.hidden_input.css({
          left: input_left,
          top: input_top,
        });

        this.hidden_input.focus();
      }

      renderClues(clues_group, clues_container) {
        const $container = $(clues_container);

        // Locate title and items within the container
        const $title = $container.find('div.cw-clues-title').length ?
          $container.find('div.cw-clues-title') :
          $container.closest('.cw-clues').find('div.cw-clues-title');

        const $items = $container.find('div.cw-clues-items').length ?
          $container.find('div.cw-clues-items') :
          $container;

        const notes = this.notes;
        $items.find('div.cw-clue').remove();

        // --- render each clue ---
        for (const clue of clues_group.clues) {
          const clue_el = $(`
            <div style="position: relative">
              <span class="cw-clue-number">${escape(clue.number)}</span>
              <span class="cw-clue-text">
                ${this.replaceUnderscores(escape(clue.text))}
              </span>
            </div>
          `);

          // attach metadata
          clue_el.data({
            clue: clue,
            word: clue.word,
            number: clue.number,
            clues: clues_group.id,
          }).addClass(`cw-clue word-${clue.word} group-${clues_group.id}`);

          // restore any saved note
          const clueNote = notes.get(clue.word);
          if (clueNote !== undefined) {
            clue_el.find('.cw-input').val(clueNote);
          }

          $items.append(clue_el);
        }

        // Set the group title
        if ($title.length) $title.text(escape(clues_group.title));
        clues_group.clues_container = $items;

        // --- event listeners ---
        const save = () => this.saveGame();

        $items
          .on('mouseleave', '.cw-clue', function(event) {
            const $el = $(this);
            const relatedTarget = event.relatedTarget;
          })
          .on('click', '.cw-input', function(event) {
            event.stopPropagation();
          })
          .on('blur', '.cw-input', function() {
            const $input = $(this);
            const $clue = $input.closest('.cw-clue');
            const wordId = $clue.data('word');
            const newText = $input.val().trim();

            setTimeout(() => {
              const newlyFocused = document.activeElement;
              if (newlyFocused?.classList.contains('cw-hidden-input')) return;

              if (newText.length > 0) {
                notes.set(wordId, newText);
              } else {
                notes.delete(wordId);
              }
              save();
            }, 10);
          })
          .on('keydown', '.cw-input', function(event) {
            if (event.key === 'Enter') $(this).blur();
          });
      }


      // Clears canvas and re-renders all cells
      renderCells() {
        const svg = this.svgContainer;
        svg.innerHTML = ''; // Clear SVG grid before redrawing
        this.svgElements = {cells: {}};

        const fillGroup = this.svgElements.fillGroup = document.createElementNS(this.svgNS, 'g');
        const barGroup = this.svgElements.barGroup = document.createElementNS(this.svgNS, 'g');
        svg.appendChild(fillGroup);
        svg.appendChild(barGroup);

        /**
         * Loop through the cells and write to SVG
         * Note: for fill and bars: we do all the fill first, then all the bars
         * This is so later fill doesn't overwrite later bars
         **/
        for (let xStr in this.cells) {
          this.svgElements.cells[xStr] = {};
          for (let yStr in this.cells[xStr]) {
            this.svgElements.cells[xStr][yStr] = {};
            this.adjustCell(this.cells[xStr][yStr]);
          }
        }
        this.positionGrid();
      }

      positionGrid() {
        // Responsive SVG sizing
        const canvasRect = this.canvas_holder.get(0).getBoundingClientRect();
        const svgTopMargin = getComputedStyle(this.svgContainer).marginTop;
        let maxHeight = 0;
        let maxWidth = 0;

        if (this.config.puzzle_size === 'puzzle_size_standard') {
          maxHeight = canvasRect.height - parseInt(svgTopMargin, 10);
          maxWidth = 544;
          this.cell_size = Math.floor(Math.min(maxWidth / this.grid_width, maxHeight / this.grid_height, 35));
        } else if (this.config.puzzle_size === 'puzzle_size_large') {
          maxHeight = canvasRect.height - parseInt(svgTopMargin, 10);
          maxWidth = 720;
          this.cell_size = Math.floor(Math.min(maxWidth / this.grid_width, maxHeight / this.grid_height));
        } else {
          maxWidth = window.innerWidth;
          maxHeight = window.innerHeight - 160;
          this.cell_size = Math.floor(Math.min(maxWidth / this.grid_width, maxHeight / this.grid_height));
        }

        const svgWidth = this.grid_width * this.cell_size;
        const svgHeight = this.grid_height * this.cell_size;

        this.svgContainer.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);
        this.svgContainer.setAttribute('width', svgWidth);
        this.svgContainer.setAttribute('height', svgHeight);

        if (this.toptext && this.toptext[0]) {
          this.toptext[0].style.width = svgWidth + 'px';
        }

        const SIZE = this.cell_size;
        const padding = 1;
        this.svgContainer.setAttribute(
          'viewBox',
          `-${padding} -${padding} ${this.grid_width * SIZE + padding * 2} ${this.grid_height * SIZE + padding * 2}`
        );

        for (const col of Object.values(this.cells)) {
          for (const cell of Object.values(col)) {
            this.adjustCellPosition(cell);
          }
        }
        setTimeout(() => this.syncTopTextWidth(), 0);
        this.setHeaderWidthToContentWidth();
      }

      setHeaderWidthToContentWidth() {
        let header = document.getElementsByClassName("cw-header")[0];
        let content = document.getElementsByClassName("cw-content")[0];
        if (header && content) {
          let contentWidth = content.offsetWidth;
          header.style.width = contentWidth + 'px';
        }
      }

      adjustCell(cell) {
        if (!this.svgElements) {
          return;
        }
        const elements = this.svgElements.cells[cell.x][cell.y];
        const shouldRender = !cell.empty || cell.clue === true || cell.type === 'block' || cell.top_right_number;

        const showRect = shouldRender;
        if (showRect && !elements.rect) {
          const rect = elements.rect = document.createElementNS(this.svgNS, 'rect');
          rect.setAttribute('data-x', cell.x);
          rect.setAttribute('data-y', cell.y);
          rect.setAttribute('class', 'cw-cell');
          this.svgElements.fillGroup.appendChild(rect);
        } else if (!showRect && elements.rect) {
          elements.rect.parentNode.removeChild(elements.rect);
          delete elements.rect;
        }
        this.adjustCellRect(cell);

        const showImage = shouldRender && cell.image;
        if (showImage && !elements.image) {
          const imageLayer = elements.image = document.createElementNS(this.svgNS, 'image');
          imageLayer.setAttribute('preserveAspectRatio', 'xMidYMid slice');
          imageLayer.setAttribute('class', 'cw-cell-image');
          imageLayer.setAttribute('href', cell.image);
          imageLayer.setAttributeNS('http://www.w3.org/1999/xlink', 'href', cell.image);
          this.svgElements.fillGroup.appendChild(imageLayer);
        } else if (!showImage && elements.image) {
          elements.image.parentNode.removeChild(elements.image);
          delete elements.image;
        }

        const showCircle = shouldRender && cell.shape === 'circle';
        if (showCircle && !elements.circle) {
          const circle = elements.circle = document.createElementNS(this.svgNS, 'circle');
          circle.setAttribute('fill', 'none');
          circle.setAttribute('stroke', 'var(--grid-stroke-color)');
          circle.setAttribute('stroke-width', 1.1);
          circle.setAttribute('pointer-events', 'none');
          this.svgElements.fillGroup.appendChild(circle);
        } else if (!showCircle && elements.circle) {
          elements.circle.parentNode.removeChild(elements.circle);
          delete elements.circle;
        }

        for (const [side, show] of Object.entries(cell.bar ?? {})) {
          const showBar = shouldRender && show;
          const key = `bar-${side}`;
          if (showBar && !elements[key]) {
            const barLine = elements[key] = document.createElementNS(this.svgNS, 'line');
            barLine.setAttribute('stroke-width', this.config.bar_linewidth);
            barLine.setAttribute('stroke-linecap', 'square');
            barLine.setAttribute('pointer-events', 'none');
            this.svgElements.barGroup.appendChild(barLine);
          } else if (!showBar && elements[key]) {
            elements[key].parentNode.removeChild(elements[key]);
            delete elements[key];
          }
          this.adjustCellBar(cell, side);
        }

        const showLetter = shouldRender && cell.letter;
        if (showLetter && !elements.letter) {
          const text = elements.letter = document.createElementNS(this.svgNS, 'text');
          text.setAttribute('text-anchor', 'middle');
          text.setAttribute('font-family', 'Arial, sans-serif');
          text.classList.add('cw-cell-letter');
          this.svgContainer.appendChild(text);
        } else if (!showLetter && elements.letter) {
          elements.letter.parentNode.removeChild(elements.letter);
          delete elements.letter;
        }
        this.adjustCellLetter(cell);

        const showNumber = shouldRender && cell.number;
        if (showNumber && !elements.number) {
          const number = elements.number = document.createElementNS(this.svgNS, 'text');
          number.setAttribute('font-family', 'Arial, sans-serif');
          number.classList.add('cw-cell-number');
          this.svgContainer.appendChild(number);
        } else if (!showNumber && elements.number) {
          elements.number.parentNode.removeChild(elements.number);
          delete elements.number;
        }
        this.adjustCellNumber(cell);

        const showTopRightNumber = shouldRender && cell.top_right_number && cell.top_right_number !== cell.letter;
        if (showTopRightNumber && !elements.top_right_number) {
            const label = elements.top_right_number = document.createElementNS(this.svgNS, 'text');
            label.setAttribute('text-anchor', 'end');
            label.setAttribute('font-family', 'Arial, sans-serif');
            label.setAttribute('pointer-events', 'none');
            label.classList.add('cw-top-right-label');
            this.svgContainer.appendChild(label);
        } else if (!showTopRightNumber && elements.top_right_number) {
          elements.top_right_number.parentNode.removeChild(elements.top_right_number);
          delete elements.top_right_number;
        }
        this.adjustCellTopRightNumber(cell);

        const showSlash = shouldRender && cell.checked;
        if (showSlash && !elements.slash) {
          const slash = elements.slash = document.createElementNS(this.svgNS, 'line');
          slash.setAttribute('stroke-linecap', 'round');
          this.svgContainer.appendChild(slash);
        } else if (!showSlash && elements.slash) {
          elements.slash.parentNode.removeChild(elements.slash);
          delete elements.slash;
        }
        this.adjustCellSlash(cell);

        this.adjustCellPosition(cell);
      }

      adjustCellPosition(cell) {
        if (!this.svgElements) {
          return;
        }
        const elements = this.svgElements.cells[cell.x][cell.y];
        const size = this.cell_size;
        const cellX = (cell.x - 1) * size;
        const cellY = (cell.y - 1) * size;
        const barCoords = {
          top: [[cellX, cellY], [cellX + size, cellY]],
          left: [[cellX, cellY], [cellX, cellY + size]],
          right: [[cellX + size, cellY + size], [cellX + size, cellY]],
          bottom: [[cellX + size, cellY + size], [cellX, cellY + size]],
        };

        if (elements.rect) {
          elements.rect.setAttribute("x", cellX);
          elements.rect.setAttribute("y", cellY);
          elements.rect.setAttribute("width", size);
          elements.rect.setAttribute("height", size);
        }
        if (elements.circle) {
          elements.circle.setAttribute('cx', cellX + size / 2);
          elements.circle.setAttribute('cy', cellY + size / 2);
          // Slightly bigger than cell, so edges are clipped
          const inset = 0.3; // lower is bigger
          const radius = size / 2 + inset;
          elements.circle.setAttribute('r', radius);
        }
        if (elements.image) {
          elements.image.setAttribute('x', cellX);
          elements.image.setAttribute('y', cellY);
          elements.image.setAttribute('width', size);
          elements.image.setAttribute('height', size);
        }
        for (const side of Object.keys(cell.bar ?? {})) {
          const key = `bar-${side}`;
          if (elements[key]) {
            const [[x1, y1], [x2, y2]] = barCoords[side];
            elements[key].setAttribute('x1', x1);
            elements[key].setAttribute('y1', y1);
            elements[key].setAttribute('x2', x2);
            elements[key].setAttribute('y2', y2);
          }
        }
        if (elements.letter) {
          const letterLength = cell.letter.length;
          const maxScale = 0.6;
          const minScale = 0.25;
          const scale = Math.max(minScale, maxScale - 0.07 * (letterLength - 1));
          elements.letter.setAttribute('x', cellX + size / 2);
          elements.letter.setAttribute('y', cellY + size * 0.90);
          elements.letter.setAttribute('font-size', `${1 + (this.cell_size * scale)}px`);
        }
        if (elements.number) {
          elements.number.setAttribute('x', cellX + size * 0.05);
          elements.number.setAttribute('y', cellY + size * 0.35);
          elements.number.setAttribute('font-size', `${(1 + (this.cell_size * .6))/2}px`);
        }
        if (elements.top_right_number) {
          elements.top_right_number.setAttribute('x', cellX + size * 0.9);
          elements.top_right_number.setAttribute('y', cellY + size * 0.3);
          elements.top_right_number.setAttribute('font-size', `${size / 3.75}px`);
        }
        if (elements.slash) {
          elements.slash.setAttribute('x1', cellX + 2);
          elements.slash.setAttribute('y1', cellY + 2);
          elements.slash.setAttribute('x2', cellX + size - 2);
          elements.slash.setAttribute('y2', cellY + size - 2);
        }
      }

      adjustCellRect(cell) {
        const rect = this.svgElements.cells[cell.x][cell.y].rect;
        if (!rect) {
          return;
        }

        // Use block color for stroke if it's a block, otherwise normal stroke color
        let rectStroke = (cell.type === 'block') ? 'var(--grid-block-color)' : 'var(--grid-stroke-color)';

        // If it's selected or in the selected word, use the specialized stroke color
        if (cell.type !== 'block' && ((this.selected_cell && cell.x === this.selected_cell.x && cell.y === this.selected_cell.y) || (this.selected_word && this.selected_word.hasCell(cell.x, cell.y)))) {
          rectStroke = 'var(--grid-selected-stroke-color)';
        }

        const isSelected = !!(this.selected_cell && cell.x === this.selected_cell.x && cell.y === this.selected_cell.y);
        const isLinked = !!(this.selected_cell && this.number_to_cells[this.selected_cell.number || this.selected_cell.top_right_number]?.includes(cell));
        rect.classList.toggle('selected', isSelected);
        rect.classList.toggle('linked', isLinked); // optional CSS hook
        rect.setAttribute('fill', this.cellFillColor(cell));
        rect.setAttribute('stroke', rectStroke);
      }

      adjustCellBar(cell, side) {
        const barLine = this.svgElements.cells[cell.x][cell.y][`bar-${side}`];
        if (!barLine) {
          return;
        }

        let barColor = 'var(--grid-stroke-color)';

        if (cell.type !== 'block' && ((this.selected_cell && cell.x === this.selected_cell.x && cell.y === this.selected_cell.y) || (this.selected_word && this.selected_word.hasCell(cell.x, cell.y)))) {
          barColor = 'var(--grid-selected-stroke-color)';
        }
        barLine.setAttribute('stroke', barColor);
      }

      adjustCellLetter(cell) {
        const letter = this.svgElements.cells[cell.x][cell.y].letter;
        if (!letter) {
          return;
        }
        letter.textContent = cell.letter;
        letter.setAttribute('fill', this.cellFontColor(cell));
      }

      adjustCellNumber(cell) {
        const number = this.svgElements.cells[cell.x][cell.y].number;
        if (!number) {
          return;
        }

        number.textContent = cell.number;
        number.setAttribute('fill', this.cellFontColor(cell));
      }

      adjustCellTopRightNumber(cell) {
        const label = this.svgElements.cells[cell.x][cell.y].top_right_number;
        if (!label) {
          return;
        }

        label.setAttribute('fill', this.cellFontColor(cell));
        label.textContent = cell.top_right_number;
      }

      adjustCellSlash(cell) {
        const slash = this.svgElements.cells[cell.x][cell.y].slash;
        if (!slash) {
          return;
        }
        slash.setAttribute('stroke', 'var(--grid-none-text-color)');
        slash.setAttribute('stroke-width', 2);
      }

      cellFillColor(cell) {
        if (cell.type === 'block') {
          return cell.color || 'var(--grid-block-color)';
        } else if (this.selected_cell && cell.x === this.selected_cell.x && cell.y === this.selected_cell.y) {
          return 'var(--grid-selected-square-color)';
        } else if (this.selected_word && this.selected_word.hasCell(cell.x, cell.y)) {
          return cell.shade_highlight_color || 'var(--grid-selected-word-color)';
        } else if (this.selected_cell && this.number_to_cells[this.selected_cell.number || this.selected_cell.top_right_number]?.includes(cell)) {
          // highlight partners
          return cell.shade_highlight_color || 'var(--grid-selected-word-color)';
        } else if (cell.color) {
          return cell.color;
        } else if (this.associated_words.some(x => x.hasCell(cell.x, cell.y))) {
          return 'var(--grid-associated-word-color)';
        } else {
          return 'var(--grid-none-color)';
        }
      }

      cellFontColor(cell) {
        const fillColor = this.cellFillColor(cell);
        if (cell.image) {
          // Images should show text in black regardless of background brightness
          return '#000000';
        } else if (typeof fillColor === 'string' && fillColor.startsWith('var(--grid-selected-square-color)')) {
          return 'var(--grid-selected-square-text-color)';
        } else if (typeof fillColor === 'string' && fillColor.startsWith('var(--grid-selected-word-color)')) {
          return 'var(--grid-selected-word-text-color)';
        } else if (typeof fillColor === 'string' && (fillColor.startsWith('var(--grid-none-color)') || fillColor.startsWith('var(--grid-block-color)'))) {
          return fillColor.includes('block') ? 'white' : 'var(--grid-none-text-color)';
        } else {
          // Brightness of the background and foreground
          const bgBrightness = Color.getBrightness(fillColor || this.config.color_none);
          const fgBrightness = Color.getBrightness(this.config.font_color_fill);

          // If we fail to meet some threshold, invert
          if (Math.abs(bgBrightness - fgBrightness) < 125) {
            var thisRGB = Color.hexToRgb(this.config.font_color_fill);
            var invertedRGB = thisRGB.map(x => 255 - x);
            return Color.rgbToHex(invertedRGB[0], invertedRGB[1], invertedRGB[2]);
          } else {
            return this.config.font_color_fill;
          }
        }
      }

      renumberGrid() {
        let number = 1;
        const width = this.grid_width;
        const height = this.grid_height;

        // Update the grid from the underlying jsxw object
        this.fillJsXw();
        console.log(this.jsxw);
        const grid = this.jsxw.grid();
        const numbering = grid.gridNumbering();

        // Assign new numbers
        for (let y = 1; y <= height; y++) {
          for (let x = 1; x <= width; x++) {
            const cell = this.getCell(x, y);
            this.updateCell(cell, {
              number: numbering[y - 1][x - 1] > 0 ? numbering[y - 1][x - 1] : null
            });
          }
        }



      } /* END renumbergrid() */

      /**
       * Handle mouse clicks on the crossword grid.
       * Works with any number of clue groups (not just Across/Down).
       */
      mouseClicked(e) {
        const offset = this.svg.offset();
        const mouse_x = e.pageX - offset.left;
        const mouse_y = e.pageY - offset.top;
        const index_x = Math.ceil(mouse_x / this.cell_size);
        const index_y = Math.ceil(mouse_y / this.cell_size);
        const clickedCell = this.getCell(index_x, index_y);

        if (!clickedCell) return;

        // --- Normal puzzle mode ---
        const sameCellClicked =
          this.selected_cell &&
          this.selected_cell.x === index_x &&
          this.selected_cell.y === index_y;

        if (sameCellClicked) {
          // Cycle to the next clue group if clicking same square again
          this.changeActiveClues();
        }

        // Try to find a matching word in the current group
        let currentGroup = this.clueGroups[this.activeClueGroupIndex];
        let matchingWord = currentGroup.getMatchingWord(index_x, index_y, true);

        // If not found, try other groups in order
        if (!matchingWord) {
          for (let i = 0; i < this.clueGroups.length; i++) {
            if (i === this.activeClueGroupIndex) continue;
            const testGroup = this.clueGroups[i];
            const testWord = testGroup.getMatchingWord(index_x, index_y, true);
            if (testWord) {
              matchingWord = testWord;
              this.activeClueGroupIndex = i; // switch to that group
              break;
            }
          }
        }

        // If still nothing found, just stay on current group
        if (matchingWord) {
          this.setActiveWord(matchingWord);
        } 

        // Update cell selection and redraw
        this.setActiveCell(clickedCell);
        this.hidden_input.focus();
      }

      prepareRebus() {
        if (this.selected_cell && this.selected_word) {
          this.hidden_input.val('');
          this.openRebus();
        }
      }

      keyPressed(e) {
        console.log(this.isModal);
        if (this.settings_open || this.isModal) {
          return;
        }

        // Prevent typing letters into the grid if an editable clue note is focused
        if (document.activeElement.classList.contains('cw-input')) {
          return;
        }

        // to prevent event propagation for specified keys
        var prevent = [35, 36, 37, 38, 39, 40, 32, 46, 8, 9, 13].indexOf(e.keyCode) >= 0;

        switch (e.keyCode) {
          case 35: // end
            this.moveToFirstCell(true);
            break;
          case 36: // home
            this.moveToFirstCell(false);
            break;
          case 37: // left
            if (e.shiftKey) {
              this.skipToWord(SKIP_LEFT);
            } else {
              this.moveSelectionBy(-1, 0);
            }
            break;
          case 38: // up
            if (e.shiftKey) {
              this.skipToWord(SKIP_UP);
            } else {
              this.moveSelectionBy(0, -1);
            }
            break;
          case 39: // right
            if (e.shiftKey) {
              this.skipToWord(SKIP_RIGHT);
            } else {
              this.moveSelectionBy(1, 0);
            }
            break;
          case 40: // down
            if (e.shiftKey) {
              this.skipToWord(SKIP_DOWN);
            } else {
              this.moveSelectionBy(0, 1);
            }
            break;

          case 32: // space
            if (this.selected_cell && this.selected_word) {
              // check config
              if (this.config.space_bar === 'space_switch') {
                const {
                  x,
                  y
                } = this.selected_cell;
                const groups = this.clueGroups || [];
                const n = groups.length;

                if (n > 1) {
                  this.changeActiveClues();
                  this.setActiveCell(this.selected_cell);
                }
              } else {
                // --- normal space behavior: clear and move to next cell
                this.updateCell(this.selected_cell, {
                  letter: '',
                  checked: false
                });
                this.saveGame();
                const next_cell = this.selected_word.getNextCell(
                  this.selected_cell.x,
                  this.selected_cell.y
                );
                this.setActiveCell(next_cell);
              }
            }

            this.checkIfSolved(); // update solved status
            break;

          case 27: // escape -- pulls up a rebus entry
            if (e.shiftKey) {
              e.preventDefault();
              this.toggleTimer();
            } else {
              this.prepareRebus();
            }
            break;
          case 45: // insert -- same as escape
            if (this.selected_cell && this.selected_word) {
              this.openRebus();
            }
            break;
          case 46: // delete
            if (this.selected_cell && !this.selected_cell.fixed) {
              this.updateCell(this.selected_cell, {
                letter: '',
                checked: false
              });
              this.saveGame();
            }
            // Update this.isSolved
            this.checkIfSolved();
            break;
          case 8: // backspace
            this.backspace();
            break;
          case 9: // tab
          case 13: // enter key -- same as tab
            var skip_filled_words = this.config.tab_key === 'tab_skip';
            if (e.shiftKey) {
              this.moveToNextWord(true, skip_filled_words);
            } else {
              this.moveToNextWord(false, skip_filled_words);
            }
            break;
          case 190: // "." key pressed
            if (this.selected_cell && (e.ctrlKey || e.metaKey)) {
              // ctrl + "." toggles circle
              const cell = this.selected_cell;
              this.updateCell(cell, {
                shape: cell.shape === 'circle' ? null : 'circle'
              });
              this.hidden_input.focus();
              prevent = true;
              break;
            }

            prevent = true;
            break;
          default: {
            // Allow any single printable character except space (space has special meaning)
            const isPrintableChar =
              e.key.length === 1 &&
              e.key !== ' ' &&
              !e.ctrlKey && !e.metaKey && !e.altKey;

            if (this.selected_cell && isPrintableChar && !this.selected_cell.fixed) {
              // Uppercase only letters, leave numbers/punctuation unchanged
              const ch = /[a-z]/i.test(e.key) ? e.key.toUpperCase() : e.key;
              this.updateCell(this.selected_cell, {
                letter: ch,
                checked: false
              });
              this.saveGame();
              this.checkIfSolved();
              this.hidden_input.focus();

              let next_cell = null;

              if (this.selected_word) {
                // Regular crossword logic
                if (this.config.skip_filled_letters && !this.selected_word.isFilled()) {
                  next_cell = this.selected_word.getFirstEmptyCell(
                    this.selected_cell.x,
                    this.selected_cell.y
                  ) || this.selected_word.getNextCell(
                    this.selected_cell.x,
                    this.selected_cell.y
                  );
                } else {
                  next_cell = this.selected_word.getNextCell(
                    this.selected_cell.x,
                    this.selected_cell.y
                  );
                }
              }

              if (next_cell) {
                this.setActiveCell(next_cell);
              }
            }
            break;
          }
        }
        if (prevent) {
          e.preventDefault();
          e.stopPropagation();
        }
      }

      backspace() {
        if (this.selected_cell && !this.selected_cell.fixed) {
          this.updateCell(this.selected_cell, {
            letter: '',
            checked: false
          });
          this.saveGame();

          if (this.selected_word) {
            const prev_cell = this.selected_word.getPreviousCell(
              this.selected_cell.x,
              this.selected_cell.y
            );
            this.setActiveCell(prev_cell);
          }

          this.checkIfSolved();
        }
      }

      // Detects user inputs to hidden input element
      hiddenInputChanged(rebus_string) {
        var next_cell;
        if (this.selected_cell) {
          if (rebus_string && rebus_string.trim()) {
            this.updateCell(this.selected_cell, {
              letter: rebus_string.toUpperCase() // ✅ Use rebus string if available
            });
          } else {
            const mychar = this.hidden_input.val().slice(0, 1).toUpperCase();
            if (mychar) {
              this.updateCell(this.selected_cell, {
                letter: mychar
              });
            }
          }
          this.updateCell(this.selected_cell, {
            checked: false
          });

          this.saveGame();

          // find empty cell, then next cell
          // Change this depending on config
          if (this.config.skip_filled_letters) {
            next_cell =
              this.selected_word.getFirstEmptyCell(
                this.selected_cell.x,
                this.selected_cell.y
              ) ||
              this.selected_word.getNextCell(
                this.selected_cell.x,
                this.selected_cell.y
              );
          } else {
            next_cell = this.selected_word.getNextCell(
              this.selected_cell.x,
              this.selected_cell.y
            );
          }

          this.setActiveCell(next_cell);
          this.checkIfSolved()
        }
        this.hidden_input.val('');
      }

      checkIfSolved(do_reveal = true) {
        var wasSolved = this.isSolved;
        var i, j, cell;
        for (i in this.cells) {
          for (j in this.cells[i]) {
            cell = this.cells[i][j];
            // if found cell without letter or with incorrect letter - return
            if (
              !cell.empty && (!cell.letter || !isCorrect(cell.letter, cell.solution))
            ) {
              this.isSolved = false;
              return;
            }
          }
        }
        // Puzzle is solved!
        this.isSolved = true;
        // stop the timer
        var timerMessage = '';
        if (this.timer_running) {
          // prepare message based on time
          var display_seconds = xw_timer_seconds % 60;
          var display_minutes = (xw_timer_seconds - display_seconds) / 60;
          var minDisplay = display_minutes == 1 ? 'minute' : 'minutes';
          var secDisplay = display_seconds == 1 ? 'second' : 'seconds';
          var allMin = display_minutes > 0 ? `${display_minutes} ${minDisplay} ` : '';
          timerMessage = `<br /><br /><center>You finished in ${allMin} ${display_seconds} ${secDisplay}.</center>`;

          // stop the timer
          clearTimeout(xw_timer);
          this.timer_button.removeClass('running');
          this.timer_running = false;
        }
        // reveal all (in case there were rebuses)
        if (do_reveal) {
          this.check_reveal('puzzle', 'reveal');
        }

        if (this.config.confetti_enabled) {
          confetti({
            particleCount: 280,
            spread: 190,
            origin: {
              y: 0.4
            }
          });
        }

        const here = this

        function showSuccessMsg(rawMessage) {

          let solvedMessage = escape(rawMessage).trim().replaceAll('\n', '<br />');
          solvedMessage += timerMessage;
          here.createModalBox('🎉🎉🎉', solvedMessage);
        }

        // show completion message if newly solved
        if (!wasSolved) {
          showSuccessMsg(this.completion_message);
        }
      }

      // callback for shift+arrows
      // finds next cell in specified direction that does not belongs to current word
      // then selects that word and selects its first empty || first cell
      skipToWord(direction) {
        if (this.selected_cell && this.selected_word) {
          var i,
            cell,
            word,
            word_cell,
            x = this.selected_cell.x,
            y = this.selected_cell.y;

          var cellFound = (cell) => {
            if (cell && !cell.empty) {
              word = this.clueGroups[this.activeClueGroupIndex].getMatchingWord(cell.x, cell.y);
              if (word && word.id !== this.selected_word.id) {
                word_cell = word.getFirstEmptyCell() || word.getFirstCell();
                this.setActiveWord(word);
                this.setActiveCell(word_cell);

                return true;
              }
            }
            return false;
          };

          switch (direction) {
            case SKIP_UP:
              for (i = y - 1; i >= 0; i--) {
                cell = this.getCell(x, i);
                if (cellFound(cell)) {
                  return;
                }
              }
              break;
            case SKIP_DOWN:
              for (i = y + 1; i <= this.grid_height; i++) {
                cell = this.getCell(x, i);
                if (cellFound(cell)) {
                  return;
                }
              }
              break;
            case SKIP_LEFT:
              for (i = x - 1; i >= 0; i--) {
                cell = this.getCell(i, y);
                if (cellFound(cell)) {
                  return;
                }
              }
              break;
            case SKIP_RIGHT:
              for (i = x + 1; i <= this.grid_width; i++) {
                cell = this.getCell(i, y);
                if (cellFound(cell)) {
                  return;
                }
              }
              break;
          }
        }
      }

      /**
       * Move to the next or previous word, cycling through all clue groups.
       */
      moveToNextWord(to_previous, skip_filled_words = false) {
        if (!this.selected_word || !this.clueGroups?.length) return;

        let next_word = null;
        let this_word = this.selected_word;
        let groupIndex = this.activeClueGroupIndex ?? 0;
        const totalGroups = this.clueGroups.length;
        let safetyCounter = 0; // counts how many times we've wrapped between groups
        const shouldSkipFilledWords =
          skip_filled_words && this.hasUnfilledWords();

        while (safetyCounter < totalGroups * 2) {
          const currentGroup = this.clueGroups[groupIndex];

          // Try to get next/prev word within the current group
          next_word = to_previous ?
            currentGroup.getPreviousWord(this_word) :
            currentGroup.getNextWord(this_word);

          if (!next_word) {
            // Reached end/start of group — wrap to next/previous group
            groupIndex = (groupIndex + 1) % totalGroups;
            this.activeClueGroupIndex = groupIndex;
            safetyCounter++; // only increment when we move between groups

            const nextGroup = this.clueGroups[groupIndex];
            next_word = to_previous ?
              nextGroup.getLastWord() :
              nextGroup.getFirstWord();
          }

          // Stop if this word is acceptable (either not filled or skipping disabled)
          if (!shouldSkipFilledWords || !next_word.isFilled()) break;

          // Otherwise, continue searching
          this_word = next_word;
        }

        // Activate new word if found
        if (next_word) {
          const cell = next_word.getFirstEmptyCell() || next_word.getFirstCell();
          this.setActiveWord(next_word);
          this.setActiveCell(cell);
        }
      }

      hasUnfilledWords() {
        return Object.values(this.words || {}).some(
          (word) => word && !word.isFilled()
        );
      }

      moveToFirstCell(to_last) {
        if (this.selected_word) {
          var cell = to_last ?
            this.selected_word.getLastCell() :
            this.selected_word.getFirstCell();
          if (cell) {
            this.setActiveCell(cell);
          }
        }
      }

      /**
       * Callback for arrow keys
       * Moves selection by one cell, possibly switching clue groups.
       * Works with any number of clue lists.
       */
      moveSelectionBy(delta_x, delta_y, jumping_over_black) {
        // Don't do anything if there's no selected cell
        if (!this.selected_cell) return;

        // Find the new cell in the specified direction
        let x = this.selected_cell.x + delta_x;
        let y = this.selected_cell.y + delta_y;
        let new_cell = this.getCell(x, y);

        if (!new_cell) return; // out of bounds

        // Try to jump over black (empty) cells
        if (new_cell.empty) {
          if (delta_x < 0) delta_x--;
          else if (delta_x > 0) delta_x++;
          else if (delta_y < 0) delta_y--;
          else if (delta_y > 0) delta_y++;
          this.moveSelectionBy(delta_x, delta_y, true);
          return;
        }

        // All clue groups
        const groups = this.clueGroups || [];
        const n = groups.length;
        if (!n) return;

        // Active clue group
        let activeGroup = groups[this.activeClueGroupIndex];

        // If new cell is outside current word
        if (!this.selected_word.hasCell(x, y)) {
          let selectedCellAltWord = null;
          let newCellAltWord = null;
          let altGroupIndex = this.activeClueGroupIndex;

          // Try to find an alternate word (perhaps in an inactive clue list) that includes current + next cell
          for (let offset = 1; offset < n; offset++) {
            const i = (this.activeClueGroupIndex + offset) % n;
            const group = groups[i];
            const match1 = group.getMatchingWord(this.selected_cell.x, this.selected_cell.y, true);
            const match2 = group.getMatchingWord(new_cell.x, new_cell.y, true);
            if (match1 && match2 && match1.id === match2.id) {
              selectedCellAltWord = match1;
              newCellAltWord = match2;
              altGroupIndex = i;
              break;
            }
          }

          // Case 1: Found a matching word in another group (switch direction)
          if (selectedCellAltWord && newCellAltWord) {
            this.activeClueGroupIndex = altGroupIndex;
            this.changeActiveClues(altGroupIndex);
            activeGroup = groups[altGroupIndex];

            // arrow-stay / arrow-move_filled config logic
            if (
              this.config.arrow_direction === 'arrow_stay' ||
              (!this.selected_cell.letter && this.config.arrow_direction === 'arrow_move_filled')
            ) {
              new_cell = this.selected_cell;
            }
          }

          // Case 2: If the new cell has no word in the current group, switch groups
          let newCellActiveWord = activeGroup.getMatchingWord(new_cell.x, new_cell.y, true);
          if (!newCellActiveWord) {
            // find the first group that *does* have a word here
            for (let offset = 1; offset < n; offset++) {
              const i = (this.activeClueGroupIndex + offset) % n;
              const group = groups[i];
              const candidate = group.getMatchingWord(x, y, true);
              if (candidate) {
                newCellActiveWord = candidate;
                this.activeClueGroupIndex = i;
                break;
              }
            }
          }

          // Always update active word
          if (newCellActiveWord) {
            this.setActiveWord(newCellActiveWord);
          }
        }

        this.setActiveCell(new_cell);
      } // END moveSelectionBy()


      windowResized() {
        setBreakpointClasses(this.root);
        resizeText(this.root, this.top_text);
        this.positionGrid();
        this.syncTopTextWidth();
      }

      syncTopTextWidth() {
        const svgEl = this.svgContainer;
        const wrapper = this.toptext?.get(0);

        if (!svgEl || !wrapper) return;

        const bbox = svgEl.getBoundingClientRect();
        const containerBox = svgEl.parentNode.getBoundingClientRect();

        const leftOffset = bbox.left - containerBox.left;
        const width = Math.round(bbox.width);

        wrapper.style.position = 'absolute';
        // wrapper.style.left = `${leftOffset}px`;
        wrapper.style.width = `${width}px`;

        // Optional debug log
        requestAnimationFrame(() => {
          const actual = wrapper.getBoundingClientRect();
        });
      }

      waitUntilSVGWidthStabilizes(finalCallback) {
        let lastWidth = null;
        let stableCount = 0;
        let tick = 0;

        const check = () => {
          const svg = this.svgContainer;
          const width = svg?.getBoundingClientRect().width || 0;

          if (lastWidth !== null && width === lastWidth) {
            stableCount++;
          } else {
            stableCount = 0;
          }

          if (stableCount >= 3) {
            finalCallback();
          } else if (tick < 30) {
            lastWidth = width;
            tick++;
            setTimeout(check, 100);
          } else {
            finalCallback();
          }
        };

        check();
      }

      // callback for clicking a clue in the sidebar
      clueClicked(e) {
        const target = $(e.currentTarget);
        const clue = target.data('clue');
        const wordId = target.data('word');
        const word = this.words[wordId];

        // Find which clue group this clue belongs to
        const clickedGroupId = target.data('clues');
        const groupIndex = this.clueGroups.findIndex(g => g.id === clickedGroupId);
        const group = this.clueGroups[groupIndex];

        if (!word) return;
        const cell = word.getFirstEmptyCell() || word.getFirstCell();
        if (!cell) return;

        // Switch directly to that group if needed
        if (groupIndex !== -1 && groupIndex !== this.activeClueGroupIndex) {
          this.changeActiveClues(groupIndex);
        }

        this.setActiveWord(word);
        this.setActiveCell(cell);
      }

      showInfo() {
        this.createModalBox(
          'Info',
          `
            <p><b>${escape(this.title)}</b></p>
            <p>${escape(this.author)}</p>
            <p><i>${escape(this.copyright)}</i></p>
          `
        );
      }

      showNotepad() {
        this.createModalBox(this.config.notepad_name, escape(this.notepad));
      }

      /**
       * Normalize selected text to letters only (A–Z).
       */
      lettersOnly(text) {
        return (text || "")
          .toUpperCase()
          .replace(/[^A-Z]/g, "");
      }

      openSettings() {
        // Create a modal box
        var settingsHTML = `
        <div class="settings-wrapper">
          <!-- Skip filled letters -->
          <div class="settings-setting">
            <div class="settings-description">
              While filling a word
            </div>
            <div class="settings-option">
              <label class="settings-label">
                <input id="skip_filled_letters" checked="checked" type="checkbox" name="skip_filled_letters" class="settings-changer">
                  Skip over filled letters
                </input>
              </label>
            </div>
            <div class="settings-option">
              <label class="settings-label">
                <input id="gray_completed_clues" type="checkbox" name="gray_completed_clues" class="settings-changer">
                  Gray out clues for completed words
                </input>
              </label>
            </div>
          </div>

          <!-- When changing direction with arrow keys -->
          <div class="settings-setting">
            <div class="settings-description">
              When changing direction with arrow keys
            </div>
            <div class="settings-option">
              <label class="settings-label">
                <input id="arrow_stay" checked="" type="radio" name="arrow_direction" class="settings-changer">
                  Stay in the same square
                </input>
              </label class="settings-label">
              <label class="settings-label">
                <input id="arrow_move" checked="" type="radio" name="arrow_direction" class="settings-changer">
                  Move in the direction of the arrow
                </input>
              </label>
              <label class="settings-label">
                <input id="arrow_move_filled" checked="" type="radio" name="arrow_direction" class="settings-changer">
                  Move in the direction of the arrow if the square is filled
                </input>
              </label>
            </div>
          </div>

          <!-- Space bar -->
          <div class="settings-setting">
            <div class="settings-description">
              When pressing space bar
            </div>
            <div class="settings-option">
              <label class="settings-label">
                <input id="space_clear" checked="" type="radio" name="space_bar" class="settings-changer">
                  Clear the current square and move forward
                </input>
              </label class="settings-label">
              <label class="settings-label">
                <input id="space_switch" checked="" type="radio" name="space_bar" class="settings-changer">
                  Switch directions
                </input>
              </label>
            </div>
          </div>

          <!-- Tab key -->
          <div class="settings-setting">
            <div class="settings-description">
              When tabbing
            </div>
            <div class="settings-option">
              <label class="settings-label">
                <input id="tab_noskip" checked="" type="radio" name="tab_key" class="settings-changer">
                  Move to the next word
                </input>
              </label class="settings-label">
              <label class="settings-label">
                <input id="tab_skip" checked="" type="radio" name="tab_key" class="settings-changer">
                  Move to the next unfilled word
                </input>
              </label>
            </div>
          </div>

          <!-- Puzzle size -->
          <div class="settings-setting">
            <div class="settings-description">
              Puzzle Size
            </div>
            <div class="settings-option">
              <label class="settings-label">
                <input id="puzzle_size_standard" checked="" type="radio" name="puzzle_size" class="settings-changer">
                  Standard
                </input>
              </label class="settings-label">
              <label class="settings-label">
                <input id="puzzle_size_large" checked="" type="radio" name="puzzle_size" class="settings-changer">
                  Large
                </input>
              </label>
              <label class="settings-label">
                <input id="puzzle_size_full_screen" checked="" type="radio" name="puzzle_size" class="settings-changer">
                  Full Screen
                </input>
              </label>
            </div>
          </div>

          <!-- Miscellaneous -->
          <div class="settings-setting">
            <div class="settings-description">
              Miscellaneous
            </div>
            <div class="settings-option">
              <label class="settings-label">
                <input id="timer_autostart" checked="" type="checkbox" name="timer_autostart" class="settings-changer">
                  Start timer on puzzle open
                </input>
              </label>
            </div>
            <div class="settings-option">
              <label class="settings-label">
                <input id="confetti_enabled" checked="" type="checkbox" name="confetti_enabled" class="settings-changer">
                  Confetti on solve
                </input>
              </label>
            </div>
          </div>
        `;

        this.createModalBox('Settings', settingsHTML);
        // Show the proper value for each of these fields
        var classChangers = document.getElementsByClassName('settings-changer');
        for (var cc of classChangers) {
          if (cc.type === 'radio') {
            document.getElementById(cc.id)['checked'] =
              this.config[cc.name] === cc.id;
          } else {
            // checkbox
            document.getElementById(cc.id)['checked'] = this.config[cc.name];
          }
        }
        // Add a listener for these events
        this.root
          .find('.settings-wrapper')
          .get(0)
          .addEventListener('click', (event) => {
            if (event.target.className === 'settings-changer') {
              if (event.target.type === 'checkbox') {
                this.config[event.target.name] = event.target.checked;

                // If the toggled setting is gray_completed_clues, re-render clues immediately
                if (event.target.name === 'gray_completed_clues') {
                  this.styleClues();
                  this.syncTopTextWidth();
                }
              } else if (event.target.type === 'radio') {
                this.config[event.target.name] = event.target.id;
                if (event.target.name === 'puzzle_size') {
                  this.updateClueLayout();
                  this.renderCells();
                }
              }
            }
            this.saveSettings();
          });
      }

      openRebus() {
        // Create a modal box
        var rebusHTML = `
        <div class="rebus-wrapper">
          <input type="text" id="rebus-text" class="rebus-text">
		    </div>
        `;

        this.createModalBox('Rebus', rebusHTML, 'Submit');
        document.getElementById("rebus-text").focus();
      }

      fillJsXw() {
        const cells = this.cells;
        this.jsxw.cells.forEach((c) => {
          const x = c.x;
          const y = c.y;
          const cellData = cells[x + 1][y + 1];

          c.letter = cellData.letter;
          c.top_right_number = cellData.top_right_number;

          // for diagramless purposes
          c.type = cellData.type;

          if (cellData.fixed === true) {
            c.fixed = true;
          } else {
            delete c.fixed; // Ensure normal cells are not accidentally flagged
          }
        });
      }

      saveSettings() {
        // we only save settings that are configurable
        var ss1 = {
          ...this.config
        };
        var savedSettings = {};
        CONFIGURABLE_SETTINGS.forEach(function(x) {
          savedSettings[x] = ss1[x];
        })
        localStorage.setItem(
          SETTINGS_STORAGE_KEY,
          JSON.stringify(savedSettings)
        );
      }

      /* Save the game to local storage */
      saveGame() {
        if (this.saveTimeout) {
          clearTimeout(this.saveTimeout);
        }
        this.saveTimeout = setTimeout(() => {
          this.saveGameImmediate();
          this.saveTimeout = null;
        }, 500); // Debounce for 500ms
      }

      saveGameImmediate() {
        // fill jsxw
        this.fillJsXw();
        // stringify
        const jsxw_str = JSON.stringify(this.jsxw.cells);
        try {
          localStorage.setItem(this.savegame_name, jsxw_str);
          localStorage.setItem(this.savegame_name + "_notes", JSON.stringify(Array.from(this.notes.entries()).map(n => {
            return {
              key: n[0],
              value: n[1]
            }
          })));
          localStorage.setItem(this.savegame_name + "_lastmodified", Date.now());
          /*localStorage.setItem(this.savegame_name + '_version', PUZZLE_STORAGE_VERSION);*/
        } catch (e) {
          console.error('[Crossword] localStorage save failed. Attempting cleanup...', e);
          const currentLimit = this.config.save_game_limit || 10;
          this.cleanupSaves(Math.floor(currentLimit / 2)); // Be more aggressive if we hit quota
          try {
            // try again once
            localStorage.setItem(this.savegame_name, jsxw_str);
            localStorage.setItem(this.savegame_name + "_lastmodified", Date.now());
          } catch (e2) {
            console.error('[Crossword] localStorage save failed even after cleanup.', e2);
          }
        }
      }

      /* Keep only the most recent saves */
      cleanupSaves(limit = null) {
        if (limit === null) {
          limit = this.config.save_game_limit || 10;
        }
        const saves = [];
        const keysToPurge = [];

        // Identify all potential save keys first to avoid iterator issues during deletion
        const allKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
          allKeys.push(localStorage.key(i));
        }

        allKeys.forEach(key => {
          if (key.startsWith(STORAGE_KEY + '_') &&
            !key.endsWith('_notes') &&
            !key.endsWith('_version') &&
            !key.endsWith('_lastmodified')) {

            const lastModifiedStr = localStorage.getItem(key + '_lastmodified');

            if (!lastModifiedStr && key !== this.savegame_name) {
              // Legacy save without timestamp - user indicated it is safe to delete
              keysToPurge.push(key);
            } else {
              saves.push({
                key,
                lastModified: parseInt(lastModifiedStr || Date.now().toString(), 10)
              });
            }
          }
        });

        // 1. Purge legacy saves
        keysToPurge.forEach(key => {
          localStorage.removeItem(key);
          localStorage.removeItem(key + '_notes');
          localStorage.removeItem(key + '_version');
          localStorage.removeItem(key + '_lastmodified');
        });

        // 2. enforce limit on remaining timestamped saves
        if (saves.length <= limit) return;

        // Sort by lastModified descending
        saves.sort((a, b) => b.lastModified - a.lastModified);

        // Delete older ones
        for (let i = limit; i < saves.length; i++) {
          const keyToDelete = saves[i].key;
          localStorage.removeItem(keyToDelete);
          localStorage.removeItem(keyToDelete + '_notes');
          localStorage.removeItem(keyToDelete + '_version');
          localStorage.removeItem(keyToDelete + '_lastmodified');
        }
      }

      /* Load a game from local storage */
      loadGame() {
        var jsxw_cells = JSON.parse(localStorage.getItem(this.savegame_name));
        // don't actually *load* it, just return the jsxw
        return jsxw_cells;
        //if (jsxw) {
        //  this.removeListeners();
        //  this.parsePuzzle(jsxw);
        //}
      }

      check_reveal(to_solve, reveal_or_check, e) {
        var my_cells = [],
          cell;

        switch (to_solve) {
          case 'letter':
            if (this.selected_cell) {
              my_cells = [this.selected_cell];
            }
            break;
          case 'word':
            if (this.selected_word) {
              for (let coord of this.selected_word.cells) {
                const c = this.selected_word.getCellByCoordinates(coord);
                if (c) {
                  my_cells.push(c);
                }
              }
            }
            break;
          case 'puzzle':
            for (let x in this.cells) {
              for (let y in this.cells[x]) {
                my_cells.push(this.cells[x][y]);
              }
            }
            break;
        }

        // Expand autofill cells (if needed)
        if (this.is_autofill) {
          const extra_cells = [];
          for (let c of my_cells) {
            const num = c.number;
            if (num != null) {
              const others = this.number_to_cells[num] || [];
              for (let oc of others) {
                const linkedCell = this.cells[oc.x][oc.y];
                if (linkedCell && !my_cells.includes(linkedCell)) {
                  extra_cells.push(linkedCell);
                }
              }
            }
          }
          my_cells = my_cells.concat(extra_cells);
        }

        for (let c of my_cells) {
          if (reveal_or_check !== 'clear' && !c.solution) {
            continue;
          }

          if (reveal_or_check === 'clear') {
            if (c.fixed) continue;
            // CLEAR
            this.updateCell(c, {
              letter: '',
              checked: false,
              revealed: false
            });
          } else if (reveal_or_check === 'reveal') {
              // ✅ SAFEGUARD for normal puzzles: don't show "#" as a letter
              if (c.solution === '#') {
                this.updateCell(c, {
                  letter: '',
                  revealed: false,
                  checked: false
                });
              } else {
                this.updateCell(c, {
                  letter: c.solution,
                  revealed: true,
                  checked: false
                });
              }
          } else if (reveal_or_check === 'check') {
              // Regular crossword
              if (c.letter) {
                this.updateCell(c, {
                  checked: !isCorrect(c.letter, c.solution)
                });
              } else {
                this.updateCell(c, {
                  checked: false
                });
              }
          }
        }

        if (reveal_or_check === 'reveal') {
          this.checkIfSolved(false);
        }

        this.saveGame();

        this.hidden_input.focus();
      }

      async printPuzzle(e) {
        // fill JSXW
        this.fillJsXw();
        try {
          let doc = await this.jsxw.toPDF();
          doc.autoPrint();
          // open in a new tab and trigger print dialog
          const blobUrl = doc.output("bloburl");
          window.open(blobUrl, "_blank");
        } catch (err) {
          console.error("PDF generation failed:", err);
        }
      }

      saveAsIpuz(e) {
        console.log(e);
        const json = window.ipuz; // this should be a JSON *string*

        // Create a Blob from the text
        const blob = new Blob([json], { type: "application/json" });

        // Create a temporary <a> element
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");

        a.href = url;
        // Try to sanitize the title for a filename
        let filename1 = this.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        if (!filename1) {
          // if this didn't work, revert to just "puzzle"
          filename1 = 'puzzle';
        }
        const filename = filename1 + '.ipuz';
        a.download = filename; // filename for the dialog

        // Trigger a click
        a.click();

        // Cleanup
        URL.revokeObjectURL(url);
      }

      toggleTimer() {
        var display_seconds, display_minutes;
        var timer_btn = this.timer_button;

        function add() {
          xw_timer_seconds = xw_timer_seconds + 1;
          display_seconds = xw_timer_seconds % 60;
          display_minutes = (xw_timer_seconds - display_seconds) / 60;

          var display =
            (display_minutes ?
              display_minutes > 9 ?
              display_minutes :
              '0' + display_minutes :
              '00') +
            ':' +
            (display_seconds > 9 ? display_seconds : '0' + display_seconds);

          timer_btn.html(display);
          timer();
        }

        function timer() {
          xw_timer = setTimeout(add, 1000);
        }

        if (this.timer_running) {
          // Stop the timer
          clearTimeout(xw_timer);
          timer_btn.removeClass('running');
          timer_btn.addClass('paused');
          this.timer_running = false;
          this.hidden_input.focus();
        } else {
          // Start the timer
          timer_btn.removeClass('paused');
          this.timer_running = true;
          timer_btn.addClass('running');
          this.hidden_input.focus();
          timer();
        }
      }

      styleClues() {
       // Update all clues in the sidebar
        this.clues_holder.find('.cw-clue').each((i, el) => {
          const $el = $(el);
          const clue = $el.data('clue');
          this.updateClueAppearance(clue, $el);
        });
      }

      getAssociatedWords(word) {
        let associated = [];
        let tempWord = null;
        for (const index in this.words) {
          tempWord = this.words[index];
          if (word.references.includes(tempWord.name)
              || (word.clue.starred && tempWord.clue.starredTheme)
              || (word.clue.starredTheme && tempWord.clue.starred)
          ) {
            associated.push(tempWord);
          }
        }
        return associated;
      }

      updateClueAppearance(clue, $el) {
        if (!clue) return;

        // Use provided $el or look it up in the DOM using unique identifying info
        const clueEl = $el || $(document).find(`.cw-clue.word-${clue.word}[data-number="${clue.number}"]`);

        // We specifically target the clue-text span to avoid graying out the clue number
        const textEl = clueEl.hasClass('cw-clue-text') ? clueEl : clueEl.find('.cw-clue-text');

        const groupId = clueEl.data('clues');
        const group = this.clueGroups.find(g => g.id === groupId);

        if (!this.config.gray_completed_clues) {
          // Reset clue styling if the setting is turned off
          textEl.css({
            "text-decoration": "",
            "color": ""
          });
          return;
        }

        // Determine if it should be gray based on word fill state
        let shouldGray = false;
        if (clue.word && this.words[clue.word]) {
          shouldGray = this.words[clue.word].isFilled();
        }

        textEl.css({
          "text-decoration": "",
          "color": shouldGray ? "#aaa" : ""
        });
      }

      updateCell(cell, properties) {
        Object.assign(cell, properties);
        this.adjustCell(cell);
        this.styleClues();
      }

      setSelectedCell(new_cell) {
        const prev_cell = this.selected_cell;
        if (prev_cell === new_cell) {
          return;
        }
        this.selected_cell = new_cell;
        for (const cell of [prev_cell, new_cell]) {
          if (!cell) {
            continue;
          }
          const number = cell.number || cell.top_right_number;
          const linked_cells = this.number_to_cells[number] ?? [cell];
          for (const linked_cell of linked_cells) {
            this.adjustCell(linked_cell);
          }
        }
      }

      setSelectedWord(new_word) {
        const prev_word = this.selected_word;
        if (prev_word === new_word) {
          return;
        }
        this.selected_word = new_word;
        for (const word of [prev_word, new_word]) {
          if (!word) {
            continue;
          }
          for (const coord of word.cells) {
            this.adjustCell(word.getCellByCoordinates(coord));
          }
        }
        let previous_associated_words = this.associated_words.map(w => w.clone());
        this.associated_words = this.getAssociatedWords(this.selected_word);
        if (previous_associated_words?.length) {
          for (const word of previous_associated_words) {
            for (const coord of word.cells) {
              this.adjustCell(word.getCellByCoordinates(coord));
            }
          }
        }
        if (this.associated_words?.length) {
          for (const word of this.associated_words) {
            for (const coord of word.cells) {
              this.adjustCell(word.getCellByCoordinates(coord));
            }
          }
        }
      }
    }

    if (typeof define === 'function' && define.amd) {
      define('CrosswordNexus', [], function() {
        return CrosswordNexus;
      });
    }

    if (registerGlobal) {
      window.CrosswordNexus = CrosswordNexus;
    }

    return CrosswordNexus;
  }
);
