
const msToString = (ms, fractionalSeconds) => {
	let m, s, frac = ''
	if(fractionalSeconds) {
		s = Math.floor(ms/1000)
		frac = '.'+(''+Math.round(ms%1000)).padStart(3, '0')
	} else s = Math.round(ms/1000)
	m = Math.floor(s/60)
	s = (''+s%60).padStart(2, '0')
	return m+':'+s+frac
}

/* -----------------------------------------------------------------------
 * TypeJig - run a typing lesson.
 *
 * `exercise` is a TypeJig.Exercise object, while `display`, `input`,
 * `output`, and `clock` are elements (or element ID strings).
 */

function TypeJig(exercise, display, results, input, clock, hint, options) {
	if(options == null) options = {}
	this.exercise = exercise;
	this.display = documentElement(display);
	this.input = documentElement(input);
	this.resultsDisplay = documentElement(results);

	const liveWPM = documentElement('live-wpm-display');
	const clockElt = documentElement(clock);
	this.liveWPM = new TypeJig.LiveWPM(liveWPM, this, options.live_wpm);
	const updateWPM = this.liveWPM.update.bind(this.liveWPM);
	this.clock = new TypeJig.Timer(clockElt, exercise.seconds, updateWPM);
	this.hint = hint;
	if(options.show_timer === "no") this.clock.hide();

	this.live_wpm = options.live_wpm;
	this.live_cpm = options.live_cpm;
	this.hint_on_fail = options.hints == "fail";
	this.lastMismatch = -1;
	if(typeof options.match === 'function') this.match = options.match
	else if(options.actualWords) this.match = TypeJig.matchExact
	else this.match = TypeJig.matchOtherSpellings

	this.errorCount = 0;
	this.enterCount = 0;

	this.lookahead = 1000;

	if(options) {
		if(options.wpm !== '' && Math.floor(+options.wpm) == options.wpm) {
			this.speed = {type: 'wpm', value: options.wpm}
		} else if(options.cpm !== '' && Math.floor(+options.cpm) == options.cpm) {
			this.speed = {type: 'cpm', value: options.cpm}
		}
		if(typeof options.alternate === 'string' && options.alternate !== '') {
			this.alternateWith = TypeJig.wordsAndSpaces(options.alternate)
			this.alternateWith.push(' ')
		}
		this.actualWords = !!options.actualWords
		this.token = options.actualWords || {
			units: 'words per minute', u: 'WPM'
		}
	}

	var self = this;  // close over `this` for event handlers.

	this.changeHandler = this.answerChanged.bind(this);
	bindEvent(document.body, 'keydown', this.keyDown.bind(this));
	bindEvent(this.input, 'input', function(ev) {
		if(!self.pendingChange) {
			self.chordTime = Math.round(ev.timeStamp);
			self.pendingChange = setTimeout(self.changeHandler, 25);
		}
	});

	var focusHandler = this.updateCursor.bind(this);
	bindEvent(this.input, 'focus', focusHandler);
	bindEvent(this.input, 'blur', focusHandler);
	function focusInput(evt) {
		self.input.focus(); evt.preventDefault();
	};
	bindEvent(this.display, 'click', focusInput);

	this.reset();
}

TypeJig.prototype.reset = function() {
	this.liveWPM.reset();

	this.actual = []
	this.changes = []

	this.enter_count = 0;
	this.resultsDisplay.textContent = '';
	if(this.exercise && !this.exercise.started) {
		this.display.textContent = '';
		this.getWords(0);
	}
	spans = this.display.querySelectorAll('span');
	if(this.speed) for(let i=0; i<spans.length; ++i) {
		spans[i].className = 'notYet';
	}

	if(this.hint && this.hint.update) {
		var word = (this.display.textContent.match(/^\S+/) || [''])[0];
		var rect = this.display.getBoundingClientRect();
		this.hint.update(word, rect.left, rect.top);
	}

	if(this.hint && this.hint_on_fail) this.hint.hide();

	this.display.previousElementSibling.textContent = '';

	this.pendingChange = true;
	this.input.value = '';
	this.input.blur();
	this.input.focus();
	delete this.pendingChange;

	this.running = false;
	this.clock.reset();

	window.scroll(0, scrollOffset(this.display));
}

TypeJig.wordsAndSpaces = function(string) {
	return string.match(/\S+|\s+/g) || [];
}

// Can contain a text-to-pseudosteno dictionary for each steno theory.
// Pseudosteno can be a single string or an array of strings, with
// longest entries first and shortest briefs last.
TypeJig.Translations = {};

TypeJig.processTranslations = function(t, fn) {
	var out = {};
	var has = Object.prototype.hasOwnProperty;
	for(var text in t) if(has.call(t, text)) {
		out[text] = fn(t[text], text);
	}
	return out;
}

TypeJig.longestTranslations = function(t) {
	return TypeJig.processTranslations(t, function(steno, text) {
		return (steno instanceof Array) ? steno[0] : steno;
	});
}

TypeJig.shortestTranslations = function(t) {
	return TypeJig.processTranslations(t, function(steno, text) {
		return (steno instanceof Array) ? steno[steno.length-1] : steno;
	});
}

TypeJig.alternateSpelling = {
	advertise: "advertize", advertises: "advertizes", advertised: "advertized", advertising: "advertizing",
	analyse: "analyze", analyses: "analyzes", analysed: "analyzed", analysing: "analyzing",
	apologise: "apologize", apologises: "apologizes", apologised: "apologized", apologising: "apologizing",
	behaviour: "behavior", behaviours: "behaviors",
	cancelled: "canceled", cancelling: "canceling",
	catalogue: "catalog", catalogues: "catalogs", catalogued: "cataloged", cataloguing: "cataloging",
	centre: "center", centres: "centers", centred: "centered",
	channelled: "chaneled", channelling: "channeling",
	characterise: "characterize", characterises: "characterizes", characterised: "characterized", characterising: "characterizing",
	colour: "color", colours: "colors", coloured: "colored", colouring: "coloring",
	counselled: "counseled", counselling: "counseling",
	criticise: "criticize", criticises: "criticizes", criticised: "criticized", criticising: "criticizing",
	dialogue: "dialog", dialogues: "dialogs", dialogued: "dialoged", dialoguing: "dialoging",
	draught: "draft", draughts: "drafts",
	emphasise: "emphasize", emphasises: "emphasizes", emphasised: "emphasized", emphasising: "emphasizing",
	equalled: "equaled", equalling: "equaling",
	favour: "favor", favours: "favors", favoured: "favored", favouring: "favoring",
	flavour: "flavor", flavours: "flavors", flavoured: "flavored", flavouring: "flavoring",
	focusses: "focuses", focussed: "focused", focussing: "focusing",
	fulfill: "fulfil", fulfills: "fulfils",
	grey: "gray", grays: "grays", greying: "graying", greyer: "grayer", greyest: "grayest",
	harbour: "harbor", harbours: "harbors", harboured: "harbored", harbouring: "harboring",
	honour: "honor", honours: "honors", honoured: "honored", honouring: "honoring",
	humour: "humor", humours: "humors", humoured: "humored", humouring: "humoring",
	initialled: "intialed", initialling: "initialing",
	labelled: "labeled", labelling: "labeling",
	labour: "labor", labours: "labors", laboured: "labored", labouring: "laboring",
	levelled: "leveled", levelling: "leveling",
	license: "licence", licenses: "licences", licensed: "licenced", licensing: "licencing",
	metre: "meter", metres: "meters",
	modelled: "modeled", modelling: "modeling",
	neighbour: "neighbor", neighbours: "neighbors", neighboured: "neighbored", neighbouring: "neighboring",
	organise: "organize", organises: "organizes", organised: "organized", organising: "organizing",
	panelled: "paneled", panelling: "paneling",
	practise: "practice", practises: "practices", practised: "practiced", practising: "practicing",
	preferred: "prefered", preferring: "prefering",
	programme: "program", programmes: "programs",
	realise: "realize", realises: "realizes", realised: "realized", realising: "realizing",
	recognise: "recognize", recognises: "recognizes", recognised: "recognized", recognising: "recognizing",
	referred: "refered", referring: "refering",
	revealled: "revealed", revealling: "revealing",
	rivalled: "rivaled", rivalling: "rivaling",
	signalled: "signaled", signalling: "signaling",
	specialise: "specialize", specialises: "specializes", specialised: "specialized", specialising: "specializing",
	summarise: "summarize", summarises: "summarizes", summarised: "summarized", summarising: "summarizing",
	totalled: "totaled", totalling: "totaling",
	traffick: "traffic", trafficks: "traffics",
	travelled: "traveled", travelling: "traveling",
	trialled: "trialed", trialling: "trialing",
}
for(const alternate in TypeJig.alternateSpelling) {
	const primary = TypeJig.alternateSpelling[alternate]
	if(alternate.substr(0, 2) !== primary.substr(0, 2)) {
		throw new Error("first two characters of "+JSON.stringify(alternate)+" and "+JSON.stringify(primary)+" don't match: time to make TypeJig.matchOtherSpellings more robust.")
	}
}

TypeJig.matchExact = (a,b) => a === b

TypeJig.matchOtherSpellings = (A,B) => {
	const a = A.toLowerCase(), b = B.toLowerCase()
	const spelling = TypeJig.alternateSpelling
	const spellingMatches = (spelling[a]||a) === (spelling[b]||b)
	const caseMatches = A.substr(0,2) === B.substr(0,2)
	return spellingMatches && caseMatches
}

// Arrays of strings (or of arrays of strings).
TypeJig.WordSets = {};
TypeJig.flattenWordSet = function(a) {
    out = [];
    for(var i=0; i<a.length; ++i) out.push.apply(out, a[i]);
    return out;
}

TypeJig.prototype.start = function() {
	this.clock.start(this.endExercise.bind(this));
	this.startTime = Date.now();
	this.running = true;
	if(this.speed) {
		this.speed.current = this.display.firstElementChild;
		this.tick();

	}
}

TypeJig.prototype.tick = function() {
	var s = this.speed;
	if(!(this.running && s && s.current)) return;
	var fn = this.tick.bind(this);
	var ms = 1000 * 60 / s.value;
	if(s.type === 'cpm') ms *= s.current.textContent.length;
	else while(/^(\s*|\p{Punctuation})$/u.test(s.current.textContent)) {
		s.current.className = '';
		s.current = s.current.nextElementSibling;
	}
	s.current.className = '';
	s.current = s.current.nextElementSibling;
	if(s.current) setTimeout(fn, ms);
}

function nextItem(range) {
	range.collapse();
	var next = range.endContainer.nextElementSibling
	if(next != null) {
		range.setStart(next, 0);
		range.setEnd(next, 1);
		if(/^\s+$/.test(range.toString())) nextItem(range)
	}
}

function nextWord(words) {
	var word = words.shift() || '';
	if(/^\s+$/.test(word)) word = words.shift() || '';
	return word;
}

function change(when, a, b, minimize) {
	const N = Math.min(a.length, b.length)
	let i
	for(i=0; i<N; ++i) if(a[i] !== b[i]) break
	const remove = a.slice(i), add = b.slice(i)
	if(minimize && remove.length > 0 && add.length > 0) {
		const M = Math.min(remove[0].length, add[0].length)
		for(i=0; i<M; ++i) if(remove[0][i] !== add[0][i]) break
		remove[0] = remove[0].slice(i)
		add[0] = add[0].slice(i)
		if(remove[0] === '') remove.shift()
		if(add[0] === '') add.shift()
	}
	return [when, remove, add]
}

function changeToString(ms, remove, add) {
	const time = msToString(ms, true)
	let change
	if(add.length === 0) change = '--'+remove.join('')+'--'
	else if(remove.length === 0) change = '++'+add.join('')+'++'
	else change = remove.join('')+'=>'+add.join('')
	return time+' '+change
}

const strokeText = s => s[2].join('')

function branchesToString(stroke, branches, prefix) {
	for(let j=3; j<stroke.length; ++j) {
		if(stroke[j][0].length > 3) {
			branchesToString(stroke[j][0], branches, prefix)
		}
		const branch = prefix+stroke[j].map(strokeText).join('')
		branches.push(branch)
	}
	return branches
}

function errorToString(tree, i) {
	let prefix = ''
	if(tree[i][1].length !== 0) {
		prefix = strokeText(tree[i-1])
	}
	let b=i+(!!tree[i][3] && tree[i][3].length)
	let result = '';
	for(let j=i; j<b; ++j) result += strokeText(tree[j])

	const stroke = tree[i]
	const branches = branchesToString(stroke, [], prefix)
	if(branches.length > 0) branches.push(result)
	return branches.join('=>')
}

function strokeIsUndo(stroke, prev) {
	const t = 0, del = 1, add = 2
	const onlyDeleted = stroke[del].length > 0 && stroke[add].length === 0
	if(onlyDeleted) return true
	if(prev == null) return false
	const addedDeletion =  stroke[add].join('') === prev[del].join('')
	const deletedAddition = stroke[del].join('') === prev[add].join('')
	return addedDeletion && deletedAddition
}

function renderStrokes(strokes, out) {
	let spans = []
	for(let i=0; i<strokes.length; ++i) {
		const from = strokes[i][1].join('')
		const to = strokes[i][2].join('')
		if(strokeIsUndo(strokes[i], strokes[i-1])) {
			if(spans.length > 0) {
				let a = spans.length-1  // previous active stroke
				while(a > 0 && spans[a].classList.contains("incorrect")) --a
				spans[a].classList.add("incorrect")
			}
		} else {
			const last = spans[spans.length-1]
			if(from !== '' && last && from !== last.textContent) {
				spans.push(N('span', from))
			}
			spans.push(N('span', to))
		}
	}
	for(let i=0; i<spans.length; ++i) {
		if(i > 0) N(out, '=>')
		N(out, spans[i])
	}
}

function errorsInContext(strokes, context) {
	context = context || 0
	const errors = []
	let s,e,n  // start, end, number of asterisks
	for(let i=1; i<strokes.length; ++i) {
		const undo = strokeIsUndo(strokes[i], strokes[i-1])
		if(undo) {
			if(n == null) {
				s = i-1;  e = i+1;  n = 1
			} else {
				s = Math.max(s-1, 0);  ++e;  ++n
			}
		} else {
			if(n > 0) {
				++e;  --n
			} else if(n === 0) {
				s = Math.max(s - context, 0)
				e = Math.min(e + context, strokes.length)
				errors.push(strokes.slice(s, e))
				n = null
			}
		}
	}
	return errors
}

function countUndoStrokes(strokes) {
	return strokes.reduce((n,s,i) => n + strokeIsUndo(s, strokes[i-1]), 0)
}

TypeJig.prototype.answerChanged = function() {
	delete this.pendingChange
	if(this.resultsDisplay.textContent !== '') return
	if(!this.running) {
		if(!!this.input.value.trim()) this.start()
		else return
	}

	// Get the exercise and the user's answer as arrays of
	// words interspersed with whitespace.
	var actual = tokenize(this.input.value.trimStart(), {wsOnly: !!this.actualWords})
	var expected = this.getWords(Math.ceil(actual.tokens.length))

	if(this.actual) {
		const C = this.changes
		if(C.ms == null) C.ms = this.chordTime
		const ms = this.chordTime - C.ms
		// C.ms = this.chordTime
		const stroke = change(ms, this.actual, actual.tokens.map(x => x.spaceBefore+x.text))
		this.changes.push(stroke)
	}
	this.actual = actual.tokens.map(x => x.spaceBefore+x.text)

	// Get the first word of the exercise, and create a range
	// which we can use to measure where it is.
	var range = document.createRange()
	range.setStart(this.display.firstElementChild, 0)
	range.setEnd(this.display.firstElementChild, 1)
	var ex, r, y, match
	r = range.getBoundingClientRect()
	y = r.bottom

	// Display the user's answer, marking it for correctness.
	var oldOutput = this.display.previousElementSibling
	var output = document.createElement('div')
	output.id = oldOutput.id
	this.errorCount = 0
	let a, partial, lastMismatch = -1
	for(a=0; a<actual.tokens.length; ++a) {
		var endOfAnswer = (a === actual.tokens.length-1)
		const A = actual.tokens[a], E = expected.tokens[a] || {text:''}
		var ac = A.text, ex = E.text
		match = this.match(ac, ex)
		partial = endOfAnswer && ac.length < ex.length && ac === ex.slice(0, ac.length)
		if(!(match || partial)) lastMismatch = a
		if(match && a === this.lastMismatch) this.lastMismatch = -1

		// Display any appropriate whitespace
		if(A.spaceBefore != '') N(output, ' ')
		if(r.bottom > y + 0.001) {
			N(output, '\n')
			if(endOfAnswer) {
				var limit = 0.66 * window.innerHeight
				var end = this.display.getBoundingClientRect().bottom
				if(end > window.innerHeight && r.bottom > limit) window.scrollBy(0, r.bottom - limit)
			}
		}
		y = r.bottom
		nextItem(range)
		r = range.getBoundingClientRect()

		// Display the token
		if(partial) {
			N(output, ac)
		} else {
			this.errorCount += !match
			const token = match ? ex : ac
			const ok = match ? 'correct': 'incorrect'
			N(output, N('span', token, {class: ok}))
		}
	}
	if(this.lastMismatch >= actual.tokens.length) this.lastMismatch = -1
	this.lastMismatch = Math.max(this.lastMismatch, lastMismatch)

	// Display final whitespace, if any, and show the "cursor".
	N(output, actual.spaceBefore)
	this.updateCursor(output)

	// End the exercise if the last word was answered correctly,
	// or if we're off the end.
	const extra = actual.tokens.length - expected.tokens.length
	if((match && extra >= 0) || extra >= 3) {
		window.setTimeout(this.clock.stop.bind(this.clock))
	}

	this.lastAnswered = range.endContainer

	var r = range.getBoundingClientRect()

	const next = (expected.tokens[a] || {text:''}).text
	if(this.hint && this.hint.update) {
		this.hint.update(match ? next : ex, r.left, r.top)
		const ok = (match || partial) && a-1 !== this.lastMismatch
		if(this.hint_on_fail && ok) this.hint.hide()
		else this.hint.show()
	}

	this.display.parentNode.replaceChild(output, oldOutput)
}

TypeJig.prototype.keyDown = function (e) {
    var id;
	if(e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) {
		this.enter_count = 0;
		return;
	}
	if(e.key === "Enter") ++this.enter_count; else this.enter_count = 0;
    switch (e.key) {
        case "Enter":
			if(this.enter_count >= 3) {
				id = "again";
				this.enter_count = 0;
			}
            break;
        case "ArrowLeft":
            id = "back";
            break;
        case "ArrowRight":
            id = "new";
            break;
    }
    if (id) {
        var link = document.getElementById(id);
        if (link) {
            link.click();
        }
    }
};

TypeJig.prototype.getWords = function(n) {
	const aw = this.actualWords
	// Split the exercise text into words (keeping the whitespace).
	var exercise = tokenize(this.display.textContent, {wsOnly: !!aw})
	const newTokens = exercise.tokens.length

	// Add more text until we have enough (or there is no more).
	if(this.exercise && typeof n === 'number') {
		n = n + this.lookahead
	}
	while(this.exercise && (!n || exercise.tokens.length < n)) {
		var text = this.exercise.getText()
		if(text) {
			var pieces = TypeJig.wordsAndSpaces(text)
			if(this.alternateWith) {
				let alt = this.alternateWith
				var words = []
				for(let i=0; i<pieces.length; ++i) {
					if(/^\S+$/.test(pieces[i])) {
						for(let j=0; j<alt.length; ++j) {
							words.push(alt[j])
						}
					}
					words.push(pieces[i])
				}
				pieces = words
			}
			tokenize(pieces.join(''), exercise)
		} else delete(this.exercise);
	}

	// Generate new HTML
	for(let i=newTokens; i<exercise.tokens.length; ++i) {
		const t = exercise.tokens[i]
		if(t.spaceBefore) N(this.display, t.spaceBefore)
		N(this.display,
			N('span', this.speed ? {class: 'notYet'} : {}, t.text))
	}

	return exercise
};

TypeJig.prototype.currentSpeed = function(seconds, prev) {
	var minutes = seconds / 60;  // KEEP fractional part for WPM calculation!
	var time = msToString(1000*seconds, false);

	var wordsFromSpaces = this.input.value.split(/\s+/).length;
	var wordsFromChars = this.input.value.length / 5;
	var words = this.actualWords ? wordsFromSpaces : wordsFromChars;
	var WPM = words / minutes;
	if(prev) WPM = (words - prev.words) / (minutes - prev.minutes)
	var correctedWPM = WPM - (this.errorCount / minutes);
	var accuracy = (1 - this.errorCount / wordsFromSpaces);
	return {
		minutes: minutes,
		time: time,
		wordsFromSpaces: wordsFromSpaces,
		wordsFromChars: wordsFromChars,
		words: words,
		WPM: WPM,
		errorCount: this.errorCount,
		correctedWPM: correctedWPM,
		accuracy: accuracy,
	}
}

function accuracyGrade(percent) {
	if(percent === 100) return 'S'
	else if(percent >= 98) return 'A+'
	else if(percent >= 95) return 'A'
	else if(percent >= 90) return 'B'
	else if(percent >= 80) return 'C'
	else return 'D'
}

function strokeStats(strokes, minutes) {
	let report = ''
	const nStrokes = strokes.length
	const undoStrokes = countUndoStrokes(strokes)
	const errorStrokes = 2*undoStrokes  // the bad stroke plus the *
	let accuracy = 100 * (1 - errorStrokes/nStrokes)
	const grade = accuracyGrade(accuracy)
	accuracy = (Math.round(accuracy*10)/10).toFixed(1)

	let sps = (nStrokes-1)/(minutes*60)
	sps = (Math.round(sps/0.05)*0.05).toFixed(2)
	let psps = (nStrokes-1 - errorStrokes)/(minutes*60)
	psps = (Math.round(psps/0.05)*0.05).toFixed(2)
	report = "Grade "+grade+" accuracy ("+
		accuracy+"%): you erased "+
		undoStrokes+" of "+nStrokes+" strokes."
	report += "\n"+sps+" average strokes per second"
	if(accuracy !== '100.0') {
		report += " ("+psps+" if you don't count erased ones)"
	}
	report += "."
	return report
}

TypeJig.prototype.endExercise = function(seconds) {
	if(this.running) this.running = false; else return;

	if(document.activeElement != document.body) document.activeElement.blur();
	unbindEvent(this.input, this.changeHandler)

	if(this.lastAnswered) {
		let elt = this.lastAnswered
		while(elt.nextSibling) elt.parentNode.removeChild(elt.nextSibling)
	}

	this.liveWPM.show(false)

	const stats = this.currentSpeed(seconds);
	if(this.actualWords) stats.unit = this.token.unit
	stats.errorCount = this.errorCount

	if(localStorage) {
		if(localStorage.save_stats != null) {
			recordExercise(localStorage, this.changes, stats)
		}
		if(localStorage.show_stats === 'false') return
	}

	renderResults(stats, this.changes, this.resultsDisplay)
}

TypeJig.prototype.addCursor = function(output) {
	if(!output) output = this.display.previousElementSibling;
	var cursor = output.querySelector('.cursor');
	if(cursor) return;
	var cursor = document.createElement('span');
	cursor.className = 'cursor';
	output.appendChild(document.createTextNode('\u200b'));
	output.appendChild(cursor);
}

TypeJig.prototype.removeCursor = function(output) {
	if(!output) output = this.display.previousElementSibling;
	var cursors = output.getElementsByClassName('cursor');
	// Note that we go backwards since it is a live collection.  Elements
	// are removed immediately so we need to not screw up indices that we
	// still need.
	for(let i=cursors.length-1; i>=0; --i) {
		var c = cursors[i];
		c.parentNode.removeChild(c.previousSibling);
		c.parentNode.removeChild(c);
	}
}

// Gets called on focus and blur events, and also gets called with a
// div when we're building the new output.
TypeJig.prototype.updateCursor = function(evt) {
	var hasFocus, output;
	if(evt.type === 'focus') hasFocus = true;
	else if(evt.type === 'blur') hasFocus = false;
	else {
		output = evt;
		hasFocus = document.activeElement === this.input;
	}
	if(hasFocus) this.addCursor(output);
	else this.removeCursor(output);
}



// -----------------------------------------------------------------------
// Helper functions

isOwnPlural = { 'cod': true };

function pluralize(word) {
	if(isOwnPlural.hasOwnProperty(word)) return word;
	switch(word[word.length-1]) {
		case 's': return word + 'es';
		case 'y': return word.slice(0, -1) + 'ies';
		default: return word + 's';
	}
}

function bindEvent(elt, evt, fn) {
	if(elt.addEventListener) elt.addEventListener(evt, fn, false);
	else if(elt.attachEvent) elt.attachEvent('on'+evt, fn);
}

function unbindEvent(elt, evt, fn) {
	if(elt.removeEventListener) elt.removeEventListener(evt, fn, false);
	else if(elt.detachEvent) elt.detachEvent('on'+evt, fn);
}

function documentElement(elt) {
	if(typeof elt === 'string') elt = document.getElementById(elt);
	return elt;
}

function scrollOffset(elt) {
	var offset = 0;
	if(elt.offsetParent) do {
		offset += elt.offsetTop;
	} while(elt = elt.offsetParent);
	return offset;
}

function hasClass(elt, className) {
	var re = new RegExp('(\s|^)' + className + '(\s|$)');
	return re.test(elt.className);
}

/**
 * Randomize array element order in-place.
 * Using Durstenfeld shuffle algorithm.
 */
function shuffle(a) {
    for (var i=a.length-1; i>=1; i--) {
        var j = Math.floor(Math.random() * (i+1));
        var a_i=a[i]; a[i]=a[j];  a[j]=a_i;
    }
    return a;
}

function randomIntLessThan(n) { return Math.floor(n * Math.random()) % n; }

function shuffleTail(a, n) {
	n = Math.min(n, a.length);
	var i = n, b = a.length - n;  // current and base indices
	while(--i > 0) {
		var other = randomIntLessThan(i+1);
		var t = a[i+b];  a[i+b] = a[other+b];  a[other+b] = t;
	}
}

function randomize(a) {
	shuffleTail(a, a.length);
	a.randomEltsUsed = 0;
}

// Rotate the first word out to the end of the array.
// If the array has been `randomize`d (has a `randomEltsUsed` property
// defined), shuffle the used words when more than 2/3 of them have been used,
// which ensures that the last word can't be shuffled to be the next one in the
// queue.
function rotateAndShuffle(a) {
	if(typeof(a.used) === 'undefined') a.used = 0;
	// don't shuffle if the current entry is multiple words
	else if (typeof a[0].i === 'undefined') {
		a.push(a.shift());
		a.used += 1;

		if(typeof(a.randomEltsUsed) === 'undefined') {
			if(a.used >= a.length) return false;
		} else {
			a.randomEltsUsed += 1;
			if(a.randomEltsUsed > 2/3 * a.length) {
				shuffleTail(a, a.randomEltsUsed);
				a.randomEltsUsed = 0;
			}
		}
	}
	return a[0];
}

TypeJig.wordCombos = function(combos) {
	let index0, index1

	function nextWord() {
		if(index0 == null) {
			shuffle(combos)
			for(let i=0; i<combos.length; ++i) shuffle(combos[i])
			index0 = 0, index1 = 0
		}
		if(index1 >= combos[index0].length) {
			index0++; index1 = 0
		}
		if(index0 < combos.length) return combos[index0][index1++]
		else {
			index0 = null
			return nextWord()
		}
	}

  return nextWord
}

// -----------------------------------------------------------------------

TypeJig.LiveWPM = function(elt, typeJig, visible) {
	this.elt = elt
	elt.innerHTML = ""
	this.typeJig = typeJig
	this.prevSpeed = null
	this.WPMHistory = []
	this.visible = visible
}

TypeJig.LiveWPM.prototype.show = function(visible) {
	if(!visible) { this.elt.innerText = ''; return }

	const unit = this.typeJig.token.u
	// Show the average of the last (up to) 5 samples
	let WPM = 0
	const n = this.WPMHistory.length, i0 = Math.max(0, n-1 - 5)
	for(let i=i0; i<n; ++i) WPM += this.WPMHistory[i]
	WPM = WPM / (n - i0)
	this.elt.innerText = Math.floor(WPM) + ' ' + unit
}

TypeJig.LiveWPM.prototype.update = function(seconds) {
	const stats = this.typeJig.currentSpeed(seconds, this.prevSpeed)
	this.prevSpeed = stats
	this.WPMHistory.push(stats.correctedWPM)
	this.show(this.visible)
}

TypeJig.LiveWPM.prototype.reset = function() {
	this.WPMHistory = []
	this.show(false)
}

function movingAvg(strokes) {
	const result = []
	for(let i=0; i<strokes.length; ++i) {
		const first = Math.max(i-4, 0)
		const last = Math.min(i+4, strokes.length-1)
		let ms = 0, chars = 0
		for(let j=first; j<=last; ++j) {
			const s = strokes[j]
			ms += s.dt
			chars += s[2].join('').length - s[1].join('').length
		}
		const minutes = ms / (1000*60)
		const words = Math.max(chars,0) / 5
		result.push({x: strokes[i][0]/1000, y: words/minutes})
	}
	return result
}


// -----------------------------------------------------------------------

TypeJig.Timer = function(elt, seconds, onUpdate) {
	this.elt = elt;
	elt.innerHTML = '';
	this.setting = seconds || 0;
	this.seconds = this.setting;
	this.fn = this.update.bind(this);
	this.showTime();
	this.onUpdate = onUpdate || function() {};
}

TypeJig.Timer.prototype.reset = function() {
	delete this.beginning;
	delete this.end;
	this.seconds = this.setting;
	this.showTime();
}

TypeJig.Timer.prototype.start = function(alarm) {
	this.finished = alarm;
	this.beginning = new Date().getTime();
	if(this.setting > 0) this.end = this.beginning + 1000 * this.setting;
	window.setTimeout(this.fn, 1000);
}

TypeJig.Timer.prototype.stop = function() {
	var elapsed = (new Date().getTime() - this.beginning) / 1000;
	if(this.finished) this.finished(elapsed);
	delete this.beginning;
	delete this.end;
}

TypeJig.Timer.prototype.update = function() {
	if(this.beginning) {
		var running = true;
		var ms, msTilNext, now = new Date().getTime();
		if(this.end) {
			ms = Math.max(0, this.end - now);
			msTilNext = ms % 1000;
			running = (ms !== 0);
		} else {
			ms = Math.max(0, now - this.beginning);
			msTilNext = 1000 - ms % 1000;
		}
		this.seconds = Math.round(ms/1000);
		this.showTime();

		if(this.end) this.onUpdate(this.setting - this.seconds);
		else this.onUpdate(this.seconds);

		if(running) window.setTimeout(this.fn, msTilNext);
		else this.stop();
	}
};

TypeJig.Timer.prototype.showTime = function() {
	if(!this.elt) return
	this.elt.innerHTML = msToString(this.seconds*1000)
}

TypeJig.Timer.prototype.hide = function() {
	this.elt.style.display = 'none';
}

// -----------------------------------------------------------------------


TypeJig.Exercise = function(words, seconds, shuffle, select, speed) {
	this.started = false;
	this.words = words;
	this.seconds = seconds;
	this.shuffle = shuffle;
	this.select = TypeJig.Exercise.select[select]
		|| TypeJig.Exercise.select.random;

	if(shuffle) randomize(this.words);
}

function indexInto(a) {
	if(typeof a.i === 'undefined') a.i = 0;
	var word = a[a.i];
	if(++a.i === a.length) delete a.i;
	return word;
}

TypeJig.Exercise.select = {
	random: function(a) { return a[randomIntLessThan(a.length)]; },
	first: function(a) { return a[0]; },
	ordered: indexInto,
	shuffled: function(a) {
		if(typeof a.i === 'undefined') randomize(a);
		return indexInto(a);
	}
};

TypeJig.Exercise.prototype.getText = function() {
	var word = rotateAndShuffle(this.words);
	if(word instanceof Array) word = this.select(word);
	var separator = this.started ? ' ' : '';
	this.started = true;
	return word ? separator + word : word;
}
