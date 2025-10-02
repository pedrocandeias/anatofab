// Flexible Flyer Hand Wrapper
// Aggregates palm + finger generator into a single callable module

include <pipe.scad>;
include <segmented_pipe_tensor.scad>;
include <fingerator.scad>;
include <paraglider_palm_left.scad>;

// Top-level: compose scaled palm; fingerator.scad uses print_* flags
// to automatically generate finger/thumb components when included.
module scaled_hand() {
    // Base palm
    scaled_palm();
}
