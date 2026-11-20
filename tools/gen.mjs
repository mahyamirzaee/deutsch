// Build app/v2/content.js from the parsed storybooks + extra theme words.
import fs from 'fs';
const [, , storiesFile, extrasFile, outFile] = process.argv;
const stories = JSON.parse(fs.readFileSync(storiesFile, 'utf8'));
const extras = JSON.parse(fs.readFileSync(extrasFile, 'utf8'));

// Exam-style writing for the review stories (10, 20, … 100), modelled on Goethe/telc A1–A2 "Schreiben".
const EXAM = {
  10: { task: 'Schreiben Sie eine kurze Nachricht an Ihre neue Nachbarin.', points: ['Wer sind Sie?', 'Woher kommen Sie?', 'Laden Sie sie zum Kaffee ein (Tag und Uhrzeit).'], words: 30, en: 'Short message to a new neighbour: who you are, where you are from, invite her for coffee.' },
  20: { task: 'Sie können morgen nicht zum Deutschkurs kommen. Schreiben Sie Ihrem Lehrer eine E-Mail.', points: ['Entschuldigen Sie sich.', 'Warum können Sie nicht kommen?', 'Fragen Sie nach den Hausaufgaben.'], words: 30, en: 'Email to your teacher: say sorry, why you can\'t come, ask about homework.' },
  30: { task: 'Schreiben Sie eine E-Mail an eine Freundin über Ihr Wochenende.', points: ['Was haben Sie am Samstag gemacht?', 'Was haben Sie am Sonntag gegessen?', 'Was machen Sie nächstes Wochenende?'], words: 35, en: 'Email about your weekend: Saturday, Sunday food, next weekend.' },
  40: { task: 'Sie machen eine Party. Schreiben Sie eine Einladung.', points: ['Wann und wo ist die Party?', 'Was gibt es zu essen und zu trinken?', 'Was sollen die Gäste mitbringen?'], words: 35, en: 'Party invitation: when/where, food and drink, what to bring.' },
  50: { task: 'Sie haben eine Anzeige gesehen: „Café sucht Aushilfe“. Schreiben Sie eine kurze E-Mail.', points: ['Stellen Sie sich vor.', 'Wann haben Sie Zeit?', 'Fragen Sie nach dem Lohn.'], words: 40, en: 'Reply to a job ad: introduce yourself, when you are free, ask about pay.' },
  60: { task: 'Ein Freund fragt: „Wie war dein Winter?“ Schreiben Sie ihm eine E-Mail.', points: ['Was haben Sie an Weihnachten oder Silvester gemacht?', 'Was war schön, was war nicht so schön?', 'Welche Pläne haben Sie für das neue Jahr?'], words: 40, en: 'Email about your winter: holidays, good/bad, plans for the new year.' },
  70: { task: 'Eine Kollegin ist krank. Schreiben Sie ihr eine Karte.', points: ['Wünschen Sie gute Besserung.', 'Erzählen Sie kurz, was es Neues bei der Arbeit gibt.', 'Bieten Sie Hilfe an.'], words: 40, en: 'Get-well card to a colleague: wish recovery, news from work, offer help.' },
  80: { task: 'Sie waren auf einer Reise. Schreiben Sie einen Beitrag im Forum: „Meine letzte Reise“.', points: ['Wohin sind Sie gefahren und mit wem?', 'Was ist passiert?', 'Würden Sie die Reise empfehlen? Warum (nicht)?'], words: 50, en: 'Forum post about your last trip: where/with whom, what happened, recommend it?' },
  90: { task: 'Im Forum ist die Frage: „Kleines Café oder große Kette – wo trinkt ihr lieber Kaffee?“ Schreiben Sie Ihre Meinung.', points: ['Was ist Ihre Meinung?', 'Geben Sie zwei Gründe (weil, denn).', 'Erzählen Sie ein Beispiel aus Ihrem Leben.'], words: 50, en: 'Forum opinion: small café or big chain; two reasons; one example.' },
  100: { task: 'Sie lernen jetzt ein Jahr Deutsch. Schreiben Sie einer Freundin eine E-Mail.', points: ['Was war am Anfang schwer?', 'Was können Sie jetzt gut?', 'Was sind Ihre Pläne für das nächste Jahr?'], words: 60, en: 'Email: one year of German — what was hard, what you can do now, plans.' },
};

const lessons = stories.filter(s => s.words.length);
const extraFor = {};
for (const lvl of ['A1', 'A2']) {
  const ls = lessons.filter(s => s.level === lvl), xs = extras[lvl];
  ls.forEach((s, i) => { extraFor[s.n] = xs.slice(Math.floor(i * xs.length / ls.length), Math.floor((i + 1) * xs.length / ls.length)); });
}
const W = r => [r.de, r.en, r.ex || ''];
const out = stories.map(s => ({
  n: s.n, t: s.title, l: s.level, review: !s.words.length,
  p: s.story.map(p => p.sp ? [p.sp, p.t] : [p.t]),
  q: s.questions, a: s.answers,
  w: s.words.map(W), c: s.chunks.map(W), x: (extraFor[s.n] || []).map(x => [x.de, x.en, '']),
  g: [s.grammar.title, s.grammar.lines],
  ...(EXAM[s.n] ? { exam: EXAM[s.n] } : {}),
}));
fs.writeFileSync(outFile, '/* Generated from "Mias Jahr in Freiburg" Teil 1–4 + the A1/A2 theme word lists. Do not edit by hand. */\nwindow.STORIES = ' + JSON.stringify(out) + ';\n');
console.log('wrote', outFile, (fs.statSync(outFile).size / 1024).toFixed(0) + ' KB');
