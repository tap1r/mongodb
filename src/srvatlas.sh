#!/bin/bash
#
# Name: "srvatlas.sh"
# Version: "0.2.2"
# Description: Atlas cluster name validator
# Authors: ["tap1r <luke.prochazka@gmail.com>"]

_clusterName="${1:?Usage: srvatlas.sh atlas-cluster-name}"

###

_shell="mongosh" # alternatively use the legacy mongo shell
_legacyShell="mongo"
_shellOpts="--tls --norc --quiet"
_openssl="openssl"
_authUser="admin.mms-automation" # alternatively can use local.__system
_cipherSuites=('tls1' 'tls1_1' 'tls1_2' 'tls1_3')
_tls1_3_suites='TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256' # OpenSSL default
_policy='HIGH:!EXPORT:!aNULL@STRENGTH' # MongoDB compiled default
_compressors="compressors=snappy,zstd,zlib" # MongoDB compiled default
_txt=$(dig +short $_clusterName TXT)

[ -z $_txt ] && { echo -e "Error: lookup failed for cluster name $_clusterName "; exit 1; }
# test if shells exist
# test if openssl exists

echo -e "\nValidating Atlas cluster name:\t${_clusterName}"
echo -e "\nTXT resource record:\t\t${_txt}"

for _srv in $(dig +short _mongodb._tcp.${_clusterName} SRV); do
    if [[ $_srv =~ ^[0-9]+$ ]]; then
        if ((_srv > 1023)); then
            _port=$_srv
        fi
    fi
    if [[ ${_srv: -13} == ".mongodb.net." ]]; then
        _host=$_srv
	    echo -e "\nSRV resource record:\t\t${_host}"
        echo -e "Resolves to CNAME/A record:\t$(dig +short ${_host} A)"
        echo -e "Service parameter: \t\tTCP/${_port}"
        _targets+=(${_host%\.}:${_port})
    fi
done

echo -e "\nDNS tests done."

echo -e "\nValidating replSet consistency:\n"

for _target in "${_targets[@]}"; do
    _uri="mongodb://${_target}/"
    echo -e "Evaluating $_target\n"
    echo -e "Self-identifier hello().me:\t$(${_shell} ${_uri} ${_shellOpts} --eval 'db.hello().me')"
    echo -e "Advertised replset name:\t$(${_shell} ${_uri} ${_shellOpts} --eval 'db.hello().setName')"
    echo -e "Advertised replset hosts:\n$(${_shell} ${_uri} ${_shellOpts} --eval 'db.hello().hosts')"
    echo -e "Advertised replset tags:\n$(${_shell} ${_uri} ${_shellOpts} --eval 'db.hello().tags')"
done

echo -e "\nReplSet tests done."

echo -e "\nValidating connectivity to individual nodes:"

for _target in "${_targets[@]}"; do
    _uri="mongodb://${_target}/"
    _saslCmd="db.runCommand({'hello':1,'saslSupportedMechs':'${_authUser}'}).saslSupportedMechs"
    echo -e "\nEvaluating $_target\n"
    echo -e "Advertised saslSupportedMechs:\t$(${_shell} ${_uri} ${_shellOpts} --eval ${_saslCmd})"
    echo -e "Advertised compression mechanisms:\t$(${_legacyShell} ${_uri}?${_compressors} ${_shellOpts} --eval 'db.hello().compression')"
    echo -e "Advertised maxWireVersion:\t$(${_shell} ${_uri} ${_shellOpts} --eval 'db.hello().maxWireVersion')"
    echo -e "\nTLS scanning ${_target}"
    for _suite in ${_cipherSuites[@]}; do
        _ciphers="None"
        for _cipher in $(${_openssl} ciphers -s -${_suite} -ciphersuites ${_tls1_3_suites} ${_policy} | tr ':' ' '); do
            ${_openssl} s_client -connect "${_target}" -cipher $_cipher -$_suite < /dev/null > /dev/null 2>&1 && _ciphers+=($_cipher)
        done
        for _cipher in "${_ciphers[@]}"; do
            function join_by { local IFS="$1"; shift; echo "$*"; }
            _joined=$(join_by , ${_ciphers[@]})
        done
        echo -e "\n$_suite:\t$_joined"
        _ciphers=()
    done
    echo -e "\n"
done

echo -e "Connectivity tests done.\n"
