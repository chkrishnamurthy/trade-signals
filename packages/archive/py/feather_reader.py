#!/usr/bin/env python3
"""Local-only native Arrow/Feather helper for the archive tooling.

The pure-JS reader (apache-arrow) cannot decode LZ4/ZSTD-compressed Feather V2
bodies, which is what this channel's files use. This helper uses pyarrow to read
them. It is LOCAL RESEARCH TOOLING under packages/archive; it is never part of
the deployed web app or worker (which stay Python-free).

Subcommands (JSON is printed to stdout):
  schema  <file>              columns, types, row count, batch count
  head    <file> [n]          first n rows (default 5) as JSON records
  summary <file>              shape of the data: time range, contracts, types
  export  <file> <symbol>     all bars for one contract, sorted by time

It never writes to the input and never touches the network.
"""
import json
import sys

import pyarrow as pa
import pyarrow.feather as feather


def _describe_schema(path: str) -> dict:
    reader = pa.ipc.open_file(path)
    schema = reader.schema
    num_rows = sum(
        reader.get_batch(i).num_rows for i in range(reader.num_record_batches)
    )
    return {
        "num_rows": num_rows,
        "num_batches": reader.num_record_batches,
        "fields": [
            {"name": f.name, "type": str(f.type), "nullable": f.nullable}
            for f in schema
        ],
    }


def _head(path: str, n: int) -> dict:
    table = feather.read_table(path)
    rows = table.slice(0, n).to_pylist()
    return {"num_rows_total": table.num_rows, "rows": rows}


def _summary(path: str) -> dict:
    import pyarrow.compute as pc

    table = feather.read_table(path)
    date_col = table.column("date")
    name_col = table.column("name")
    type_col = table.column("instrument_type")

    # Counts per underlying and per instrument type.
    name_counts = pc.value_counts(name_col)
    type_counts = pc.value_counts(type_col)

    def _pairs(value_counts):
        return sorted(
            (
                {"value": str(x["values"]), "rows": x["counts"].as_py()}
                for x in value_counts
            ),
            key=lambda r: r["rows"],
            reverse=True,
        )

    return {
        "num_rows": table.num_rows,
        "time_range": {
            "min": str(pc.min(date_col).as_py()),
            "max": str(pc.max(date_col).as_py()),
        },
        "distinct_symbols": pc.count_distinct(table.column("symbol")).as_py(),
        "distinct_expiries": pc.count_distinct(table.column("expiry")).as_py(),
        "by_underlying": _pairs(name_counts),
        "by_instrument_type": _pairs(type_counts),
    }


def _export(path: str, symbol: str) -> dict:
    import pyarrow.compute as pc

    table = feather.read_table(path)
    mask = pc.equal(table.column("symbol"), symbol)
    sel = table.filter(mask).sort_by("date")
    cols = ["date", "open", "high", "low", "close", "volume", "oi"]
    rows = sel.select(cols).to_pylist()
    return {"symbol": symbol, "num_rows": len(rows), "bars": rows}


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        sys.stderr.write("Usage: feather_reader.py <schema|head> <file> [n]\n")
        return 64
    command, path = argv[0], argv[1]
    if command == "schema":
        result = _describe_schema(path)
    elif command == "head":
        n = int(argv[2]) if len(argv) > 2 else 5
        result = _head(path, n)
    elif command == "summary":
        result = _summary(path)
    elif command == "export":
        if len(argv) < 3:
            sys.stderr.write("Usage: feather_reader.py export <file> <symbol>\n")
            return 64
        result = _export(path, argv[2])
    else:
        sys.stderr.write(f"Unknown command: {command}\n")
        return 64
    # default=str renders datetime/date/Decimal safely.
    sys.stdout.write(json.dumps(result, default=str, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
