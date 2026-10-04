const MAMMOTH_XML_PARSE = 'domParser.parseFromString(string);';
const MAMMOTH_XML_PARSE_WITH_TYPE = 'domParser.parseFromString(string, "text/xml");';
const MAMMOTH_ERROR_HANDLER = 'errorHandler: function(level, message)';
const MAMMOTH_ON_ERROR = 'onError: function(level, message)';

export function patchMammothXmlParser(contents) {
  const parseCalls = contents.split(MAMMOTH_XML_PARSE).length - 1;
  const errorHandlers = contents.split(MAMMOTH_ERROR_HANDLER).length - 1;
  if (parseCalls !== 1 || errorHandlers !== 1) {
    throw new Error(
      `Mammoth XML parser signature changed: found ${parseCalls} untyped parse calls and ` +
      `${errorHandlers} deprecated error handlers; ` +
      'review the compatibility patch before upgrading Mammoth.',
    );
  }

  return contents
    .replace(MAMMOTH_XML_PARSE, MAMMOTH_XML_PARSE_WITH_TYPE)
    .replace(MAMMOTH_ERROR_HANDLER, MAMMOTH_ON_ERROR);
}
