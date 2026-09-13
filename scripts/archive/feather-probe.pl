#!/usr/bin/env perl
use strict;
use warnings;
use Fcntl qw(SEEK_SET SEEK_END);
use JSON::PP;

# Read-only format probe. No Arrow decoding, schema validation or whole-file reads.
# The native reader will be selected after the runtime and sample format are confirmed.
my $path = shift @ARGV;
die "Usage: perl scripts/archive/feather-probe.pl FILE.feather\n" unless defined $path && !@ARGV;
open my $fh, '<:raw', $path or die "Cannot open input file: $!\n";
my @info = stat($fh);
die "Input must be a regular file\n" unless -f $fh;
my $size = $info[7];
my $bytes_read = 0;
sub read_at {
    my ($offset, $length) = @_;
    seek($fh, $offset, SEEK_SET) or die "Cannot seek input: $!\n";
    my $buffer = '';
    my $read = read($fh, $buffer, $length);
    die "Cannot read input: $!\n" unless defined $read;
    $bytes_read += $read;
    return $buffer;
}
my $head = read_at(0, $size < 6 ? $size : 6);
my $format = 'unknown';
my $envelope = JSON::PP::false;
my $footer_bytes;
if (substr($head, 0, 6) eq 'ARROW1' && $size >= 18) {
    $format = 'feather_v2_or_arrow_ipc';
    my $tail = read_at($size - 10, 10);
    $footer_bytes = unpack('V', substr($tail, 0, 4));
    $envelope = JSON::PP::true if substr($tail, 4, 6) eq 'ARROW1' && $footer_bytes > 0 && $footer_bytes <= $size - 18;
} elsif (substr($head, 0, 4) eq 'FEA1' && $size >= 12) {
    $format = 'feather_v1';
    my $tail = read_at($size - 8, 8);
    $footer_bytes = unpack('V', substr($tail, 0, 4));
    $envelope = JSON::PP::true if substr($tail, 4, 4) eq 'FEA1' && $footer_bytes > 0 && $footer_bytes <= $size - 12;
}
close $fh or die "Cannot close input: $!\n";
my %modules;
for my $module ('Glib::Object::Introspection', 'FFI::Platypus') {
    eval "require $module";
    $modules{$module} = $@ ? JSON::PP::false : JSON::PP::true;
}
print JSON::PP->new->canonical->pretty->encode({
    file_bytes => "$size", format => $format, envelope_consistent => $envelope,
    footer_bytes => $footer_bytes, bytes_read => $bytes_read,
    schema_validated => JSON::PP::false, compression => 'uninspected',
    perl_version => sprintf('%vd', $^V), available_modules => \%modules,
    note => 'Signature check only. A compatible Arrow reader must still validate schema, compression and record batches.',
});
exit($envelope ? 0 : 2);
