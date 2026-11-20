import { readMusicXml } from './read';
import { writeTabText } from './write';
import { parseXml, type XmlParser } from './xml';

/** MusicXML text → tab text for the paste box, with the reader's notices. Throws `ImportError`. */
export function musicXmlToTabText(xmlText: string, parser: XmlParser): { text: string; notices: string[] } {
  const score = readMusicXml(parseXml(xmlText, parser));
  return { text: writeTabText(score), notices: score.notices };
}
