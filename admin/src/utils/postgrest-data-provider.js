import HttpError from "ra-core/lib/dataProvider/HttpError";
import { GET_LIST, GET_ONE, GET_MANY, GET_MANY_REFERENCE, CREATE, UPDATE, DELETE, DELETE_MANY } from "react-admin";
import { AUTH_LOGIN, AUTH_LOGOUT, AUTH_ERROR } from "react-admin";
import json2ParseBigint from "./json_parse_bigint";

// NOTE: The current perms token (and refresh) is used when we are talking directly to PostgREST over a tunnel.
// The current auth token, if set, is used when we're talking to reticulum proxying PostgREST.
let currentPermsToken = null;
let currentAuthToken = null;

function queryParameters(data) {
  const ret = [];
  for (const d in data) ret.push(encodeURIComponent(d) + "=" + encodeURIComponent(data[d]));
  return ret.join("&");
}

// Custom fetchJson routing to ensure bigint precision
const fetchJson = (url, options) => {
  const requestHeaders =
    options.headers ||
    new Headers({
      Accept: "application/json"
    });
  if (!requestHeaders.has("Content-Type") && !(options && options.body && options.body instanceof FormData)) {
    requestHeaders.set("Content-Type", "application/json");
  }

  return fetch(url, { ...options, headers: requestHeaders })
    .then(response =>
      response.text().then(text => ({
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        body: text
      }))
    )
    .then(({ status, statusText, headers, body }) => {
      let json;
      try {
        json = json2ParseBigint(body);
      } catch (e) {
        // not json
        console.warn(e);
      }

      if (status < 200 || status >= 300) {
        throw new HttpError((json && json.message) || statusText, status, json);
      }

      return { status, headers, body, json };
    });
};

/**
 * Maps admin-on-rest queries to a postgrest API
 *
 * The REST dialect is similar to the one of FakeRest
 * @see https://github.com/marmelab/FakeRest
 * @example
 * GET_MANY_REFERENCE
 *              => GET http://my.api.url/posts/2
 * GET_LIST     => GET http://my.api.url/posts?order=title.asc
 * GET_ONE      => GET http://my.api.url/posts?id=eq.123
 * GET_MANY     => GET http://my.api.url/posts?id=in.( 123,456,789 )
 * UPDATE       => PATCH http://my.api.url/posts?id=eq.123
 * CREATE       => POST http://my.api.url/posts
 * DELETE       => DELETE http://my.api.url/posts?id=eq.123
 */
const postgrestClient = (apiUrl, httpClient = fetchJson) => {
  const convertFilters = filters => {
    const rest = {};

    Object.keys(filters).map(function(key) {
      switch (typeof filters[key]) {
        case "string":
          rest[key] = "ilike.*" + filters[key].replace(/:/, "") + "*";
          break;

        case "boolean":
          rest[key] = "is." + filters[key];
          break;

        case "undefined":
          rest[key] = "is.null";
          break;

        case "number":
          rest[key] = "eq." + filters[key];
          break;

        case "object":
          if (filters[key].constructor === Array) {
            rest[key] = "cs.{" + filters[key].toString().replace(/:/, "") + "}";
          } else {
            Object.keys(filters[key]).map(val => (rest[`${key}->>${val}`] = `ilike.*${filters[key][val]}*`));
          }
          break;

        default:
          rest[key] = "ilike.*" + filters[key].toString().replace(/:/, "") + "*";
          break;
      }
    });
    return rest;
  };

  /**
   * @param {String} type One of the constants appearing at the top if this file, e.g. 'UPDATE'
   * @param {String} resource Name of the resource to fetch, e.g. 'posts'
   * @param {Object} params The REST request params, depending on the type
   * @returns {Object} { url, options } The HTTP request parameters
   */
  const convertRESTRequestToHTTP = (type, resource, params) => {
    let url = "";
    const options = {};
    options.headers = new Headers();
    options.headers.set("Authorization", `Bearer ${currentAuthToken || currentPermsToken}`);
    const stripReadOnlyColumns = json => {
      const newJson = {};

      for (const k of Object.keys(json)) {
        if (k.startsWith("_")) continue;
        newJson[k] = json[k];
      }

      return newJson;
    };

    switch (type) {
      case GET_LIST: {
        const { page, perPage } = params.pagination;
        const { field, order } = params.sort;
        options.headers.set("Range-Unit", "items");
        options.headers.set("Prefer", "count=exact");
        const query = {
          order: field + "." + order.toLowerCase(),
          offset: (page - 1) * perPage,
          limit: perPage
        };
        Object.assign(query, convertFilters(params.filter));
        url = `${apiUrl}/${resource}?${queryParameters(query)}`;
        break;
      }

      case GET_ONE: {
        options.headers.set("Accept", "application/vnd.pgrst.object+json");
        url = `${apiUrl}/${resource}?id=eq.${params.id}`;
        break;
      }

      case GET_MANY: {
        url = `${apiUrl}/${resource}?id=in.( ${params.ids.join(",")} )`;
        break;
      }

      case GET_MANY_REFERENCE: {
        const filters = {};
        const { field, order } = params.sort;
        filters[params.target] = params.id;
        const query = {
          order: field + "." + order.toLowerCase()
        };
        Object.assign(query, convertFilters(filters));
        url = `${apiUrl}/${resource}?${queryParameters(query)}`;
        break;
      }

      case UPDATE: {
        url = `${apiUrl}/${resource}?id=eq.${params.id}`;
        options.method = "PATCH";
        options.headers.set("Accept", "application/vnd.pgrst.object+json");
        options.headers.set("Prefer", "return=representation");
        options.body = JSON.stringify(stripReadOnlyColumns(params.data));
        break;
      }

      case CREATE: {
        url = `${apiUrl}/${resource}`;
        options.headers.set("Accept", "application/vnd.pgrst.object+json");
        options.headers.set("Prefer", "return=representation");
        options.method = "POST";
        const postParams = JSON.parse(JSON.stringify(params.data));
        postParams.inserted_at = postParams.updated_at = new Date().toISOString();
        options.body = JSON.stringify(stripReadOnlyColumns(postParams));
        break;
      }

      case DELETE: {
        url = `${apiUrl}/${resource}?id=eq.${params.id}`;
        options.method = "DELETE";
        break;
      }

      case DELETE_MANY: {
        url = `${apiUrl}/${resource}?id=in.( ${params.ids.join(",")} )`;
        options.method = "DELETE";
        break;
      }

      default: {
        throw new Error(`Unsupported fetch action type ${type}`);
      }
    }

    return { url, options };
  };

  /**
   * @param {Object} response HTTP response from fetch()
   * @param {String} type One of the constants appearing at the top if this file, e.g. 'UPDATE'
   * @param {String} resource Name of the resource to fetch, e.g. 'posts'
   * @param {Object} params The REST request params, depending on the type
   * @returns {Object} REST response
   */
  const convertHTTPResponseToREST = (response, type, resource, params) => {
    const { headers, json } = response;
    const maxInPage =
      parseInt(
        headers
          .get("content-range")
          .split("/")[0]
          .split("-")
          .pop(),
        10
      ) + 1;

    switch (type) {
      case GET_LIST:
      case GET_MANY_REFERENCE:
        if (!headers.has("content-range")) {
          throw new Error(
            "The Content-Range header is missing in the HTTP Response. The simple REST client expects responses for lists of resources to contain this header with the total number of results to build the pagination. If you are using CORS, did you declare Content-Range in the Access-Control-Expose-Headers header?"
          );
        }
        return {
          data: json.map(x => x),
          total:
            parseInt(
              headers
                .get("content-range")
                .split("/")
                .pop(),
              10
            ) || maxInPage
        };

      case CREATE:
        return { data: json };

      case UPDATE:
        return { data: json };

      case DELETE:
        return { data: params.previousData };

      case DELETE_MANY:
        return { data: params.ids };

      case GET_ONE:
        return { data: json };

      default:
        return { data: json };
    }
  };

  /**
   * @param {string} type Request type, e.g GET_LIST
   * @param {string} resource Resource name, e.g. "posts"
   * @param {Object} payload Request parameters. Depends on the request type
   * @returns {Promise} the Promise for a REST response
   */
  return (type, resource, params) => {
    const { url, options } = convertRESTRequestToHTTP(type, resource, params);
    return httpClient(url, options).then(response => convertHTTPResponseToREST(response, type, resource, params));
  };
};

let retPhxChannel;

const setAuthToken = function(token) {
  currentAuthToken = token;
};

export const refreshPermsToken = function() {
  return new Promise((resolve, reject) => {
    retPhxChannel
      .push("refresh_perms_token")
      .receive("ok", ({ perms_token }) => {
        currentPermsToken = perms_token;
        resolve(perms_token);
      })
      .receive("error", err => {
        console.error("failed to fetch perms", err);
        reject();
      });
  });
};

const createAuthProvider = channel => {
  retPhxChannel = channel;

  return async (type, params) => {
    if (type === AUTH_LOGIN) {
      const token = await refreshPermsToken();
      return token;
    }

    if (type === AUTH_LOGOUT) {
      currentAuthToken = null;
      currentPermsToken = null;
      return Promise.resolve();
    }

    if (type === AUTH_ERROR) {
      const status = params.status;
      if (status === 401 || status === 403) {
        let redirectTo = "/?sign_in&sign_in_destination=admin";

        if (currentAuthToken || currentPermsToken) {
          redirectTo = redirectTo + "&sign_in_reason=admin_no_permission";
        }

        currentAuthToken = null;
        currentPermsToken = null;

        // Rejecting with redirectTo doesn't work if perm check failed for some reason.
        document.location = redirectTo;
        return Promise.reject();
      }
      return Promise.resolve();
    }

    return Promise.resolve();
  };
};

const postgrestAuthenticatior = {
  createAuthProvider,
  refreshPermsToken,
  setAuthToken
};

export { postgrestClient, postgrestAuthenticatior };
