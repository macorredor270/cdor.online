use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoreRequest<'a> {
    pub value: &'a str,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadResponse {
    pub value: Option<String>,
}

#[cfg(target_os = "android")]
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveHostRequest<'a> {
    pub host: &'a str,
}

#[cfg(target_os = "android")]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveHostResponse {
    pub addresses: Vec<String>,
}

#[derive(Debug, Default, Deserialize, Serialize)]
pub struct Empty {}
