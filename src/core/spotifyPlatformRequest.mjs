export function sendSpotifyPlatformRequest(platform, {
    host, path, endpointIdentifier, queryParameters, withoutMarket = false,
}) {
    const requestBuilder = platform?.RequestBuilder;
    if (typeof requestBuilder?.build !== 'function') {
        throw new Error('Spicetify Platform RequestBuilder missing');
    }
    let builder = requestBuilder.build()
        .withHost(host)
        .withPath(path)
        .withEndpointIdentifier(endpointIdentifier);
    if (queryParameters && Object.keys(queryParameters).length > 0) {
        builder = builder.withQueryParameters(queryParameters);
    }
    if (withoutMarket && typeof builder.withoutMarket === 'function') {
        builder = builder.withoutMarket();
    }
    return builder.send();
}

export function readSpotifyResponseStatus(response, fallback = 200) {
    for (const value of [response?.status, response?.statusCode, response?.response?.status, response?.response?.statusCode]) {
        const status = Number(value);
        if (Number.isInteger(status) && status >= 100 && status <= 599) return status;
    }
    return fallback;
}

export function readSpotifyResponseBody(response) {
    if (typeof response?.json === 'function') return response.json();
    const body = response != null && typeof response === 'object' && 'body' in response ? response.body : response;
    if (typeof body === 'string') return body.trim() ? JSON.parse(body) : null;
    return body ?? null;
}
