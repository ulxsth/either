const gulp = require('gulp');
const uglify = require('gulp-uglify');

gulp.task('js-minify', () => {
  return gulp.src(['./src/*.js'])
    .pipe(uglify())
    .pipe(gulp.dest('./dist/'));
});
